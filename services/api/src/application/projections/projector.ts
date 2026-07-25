import type { DomainEventFact } from "@open-ticket/contracts";

import type { EventLog, GlobalEvent, GlobalPosition } from "../event-log.ts";
import { subscribe } from "../subscription.ts";
import type { Scheduler, Subscription } from "../subscription.ts";

import { ReadModelStore } from "./read-model-store.ts";
import { applySeatMap, emptySeatMap } from "./seat-map.ts";
import type { SeatMapState } from "./seat-map.ts";

type SeatMapReducer = (state: SeatMapState, event: DomainEventFact) => SeatMapState;

export interface ProjectorDeps {
  readonly log: EventLog;
  readonly store?: ReadModelStore;
  readonly scheduler?: Scheduler;
  /** The reducer to apply — defaults to `applySeatMap`; injectable so tests can force a failure. */
  readonly reducer?: SeatMapReducer;
}

/**
 * Wires the SeatMap reducer to a catch-up subscription (D2-01). On construction it subscribes from
 * position 0 — replaying history then staying live — routing each event to its show by `streamId`,
 * applying the reducer, and advancing `asOf`. A reducer/handler throw stops the subscription; the
 * failure is surfaced through `isHealthy()`/`lastError()` (PR1's `failed()` was pull-only) so a dead
 * projection can be detected rather than silently serving stale reads.
 */
export class Projector {
  private readonly store: ReadModelStore;
  private readonly reduce: SeatMapReducer;
  private readonly subscription: Subscription;

  constructor(deps: ProjectorDeps) {
    this.store = deps.store ?? new ReadModelStore();
    this.reduce = deps.reducer ?? applySeatMap;
    this.subscription = subscribe({
      log: deps.log,
      from: 0,
      handler: (event) => {
        this.project(event);
      },
      // Omit `scheduler` when unset (exactOptionalPropertyTypes) so the default microtask one is used.
      ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
    });
  }

  private project(event: GlobalEvent): void {
    const showId = event.streamId;
    const previous = this.store.getShow(showId) ?? emptySeatMap;
    // If the reducer throws, we advance neither the show nor `asOf` — the subscription stops here.
    this.store.setShow(showId, this.reduce(previous, event));
    this.store.advanceAsOf(event.globalPosition);
  }

  /** The show's raw SeatMap state, or `undefined` if the projector hasn't seen it yet (PR3 → 404). */
  getSeatMap(showId: string): SeatMapState | undefined {
    return this.store.getShow(showId);
  }

  /** The global position the projection reflects (D2-05). */
  asOf(): GlobalPosition {
    return this.store.asOf;
  }

  /** How far the projection trails the log right now. */
  lag(): Promise<number> {
    return this.subscription.lag();
  }

  /** False once a reducer threw — the read side must not serve as if live. */
  isHealthy(): boolean {
    return this.subscription.failed() === undefined;
  }

  lastError(): unknown {
    return this.subscription.failed();
  }

  /** Resolves when the projector is idle — the test drain seam. */
  settled(): Promise<void> {
    return this.subscription.settled();
  }

  stop(): void {
    this.subscription.stop();
  }
}
