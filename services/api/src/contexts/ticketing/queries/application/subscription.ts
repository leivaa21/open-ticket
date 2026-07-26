import type { EventLog, GlobalEvent, GlobalPosition } from "./event-log.ts";

/**
 * A catch-up subscription primitive (D2-03): replay `readAll` from a position, apply each event
 * through the handler, track position, then process live commits via `onCommitted`. The pump is
 * SERIALIZED (never two batches at once) and COALESCING (commits during an in-flight batch trigger
 * exactly one follow-up pass — nothing dropped, nothing overlapped), mirroring an EventStoreDB
 * catch-up subscription and the envpact watch engine's injected-scheduler + `settled()` drain seam.
 */

/** Defers a task off the current call stack — injected so tests drive delivery deterministically. */
export interface Scheduler {
  schedule(task: () => void): void;
}

/** Production default: run the pump on the next microtask (no timer, no sleep). */
export const microtaskScheduler: Scheduler = {
  schedule(task) {
    queueMicrotask(task);
  },
};

export interface SubscribeOptions {
  readonly log: EventLog;
  /** Where to start replaying (0 = from the beginning of the log). */
  readonly from: GlobalPosition;
  /** Applies one event; may be async. A throw stops the subscription and is exposed via `failed()`. */
  readonly handler: (event: GlobalEvent) => void | Promise<void>;
  readonly scheduler?: Scheduler;
}

export interface Subscription {
  /** The next global position to consume — advances as events are applied. Public for lag. */
  readonly position: GlobalPosition;
  /** `log head − position` (≥ 0): how far the subscription trails the log right now. */
  lag(): Promise<number>;
  /** Resolves when the pump is idle — the test drain seam. Never rejects; see `failed()`. */
  settled(): Promise<void>;
  /** The handler error that stopped the subscription, or `undefined`. */
  failed(): unknown;
  /** Stop delivery: unsubscribe from commits and halt the pump (idempotent). */
  stop(): void;
}

export function subscribe(options: SubscribeOptions): Subscription {
  const { log, handler } = options;
  const scheduler = options.scheduler ?? microtaskScheduler;

  let position = options.from;
  let idle: Promise<void> = Promise.resolve();
  let unsubscribeFromLog: () => void = () => undefined;
  // Held on an object so TS doesn't narrow the closure-mutated flags to literals across the `await`
  // in `drain` (the `no-unnecessary-condition` false positive envpact hit too).
  const state = { running: false, pending: false, stopped: false, failure: undefined as unknown };

  // Read through a function so control-flow can't narrow the closure-mutated flag to a literal.
  const isStopped = (): boolean => state.stopped;

  const stop = (): void => {
    state.stopped = true;
    unsubscribeFromLog();
  };

  // One pass over unapplied events, looping while more commits arrived mid-flight (coalescing).
  // `running` is released in `finally` (synchronously, before the promise resolves), so a commit
  // that lands right after a pass either was caught by the loop or starts a fresh pump — no wakeups
  // are lost, and two passes never overlap.
  const drain = async (): Promise<void> => {
    try {
      while (state.pending && !isStopped()) {
        state.pending = false;
        const { events } = await log.readAll(position);
        for (const event of events) {
          if (isStopped()) return;
          await handler(event);
          position = event.globalPosition + 1;
        }
      }
    } finally {
      state.running = false;
    }
  };

  const requestPump = (): void => {
    if (state.stopped) return;
    state.pending = true;
    if (state.running) return;
    state.running = true;
    idle = new Promise<void>((resolve) => {
      scheduler.schedule(() => {
        drain().then(resolve, (error: unknown) => {
          state.failure = error; // a handler throw is a projection bug — surface it and stop.
          stop();
          resolve();
        });
      });
    });
  };

  unsubscribeFromLog = log.onCommitted(requestPump);
  requestPump(); // initial catch-up from `from`

  return {
    get position() {
      return position;
    },
    async lag() {
      const { head } = await log.readAll(position);
      // Clamped: a subscription resumed from a position beyond head (a caller error) reads 0, not
      // negative — lag is "events still to consume", never below zero.
      return Math.max(0, head - position);
    },
    settled() {
      return idle;
    },
    failed() {
      return state.failure;
    },
    stop,
  };
}
