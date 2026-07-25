import type { EventLog, GlobalEvent, ReadAllResult } from "./event-log.ts";
import { heldFact } from "./test-support.ts";

/**
 * Test-only helpers for the subscription primitive: a controllable `EventLog` and a gated handler.
 * Not a `.test.ts`, so Vitest never runs it; not reachable from `main.ts`, so it never ships.
 */

/** A controllable EventLog: seed/commit events, count reads, fire wake-ups — the deterministic seam. */
export class FakeLog implements EventLog {
  private readonly log: GlobalEvent[] = [];
  private readonly listeners = new Set<() => void>();
  public readAllCalls = 0;

  seed(count: number): void {
    for (let index = 0; index < count; index += 1) this.push();
  }

  commit(): void {
    this.push();
    for (const listener of this.listeners) listener();
  }

  private push(): void {
    const globalPosition = this.log.length;
    this.log.push({
      ...heldFact(`h${String(globalPosition)}`, "buyer", 999, "A1"),
      streamId: "show-1",
      revision: globalPosition,
      globalPosition,
    });
  }

  readAll(fromPosition: number): Promise<ReadAllResult> {
    this.readAllCalls += 1;
    return Promise.resolve({
      events: this.log.slice(Math.max(0, fromPosition)),
      head: this.log.length,
    });
  }

  head(): number {
    return this.log.length;
  }

  onCommitted(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

interface Signal {
  readonly promise: Promise<void>;
  fire(): void;
}
function signal(): Signal {
  let fire!: () => void;
  const promise = new Promise<void>((resolve) => {
    fire = () => {
      resolve();
    };
  });
  return { promise, fire };
}

export interface GatedHandler {
  readonly handler: (event: GlobalEvent) => Promise<void>;
  /** Resolves once the handler reaches the gated event. */
  readonly reached: Promise<void>;
  /** Lets the gated handler proceed. */
  release(): void;
  readonly applied: number[];
  /** Peak number of handler invocations in flight at once — 1 means serialized. */
  maxActive(): number;
}

/** A handler that pauses when it reaches `gateAt`, recording apply order and peak concurrency. */
export function gatedHandler(gateAt: number): GatedHandler {
  const reached = signal();
  const release = signal();
  const applied: number[] = [];
  let active = 0;
  let maxActive = 0;

  const handler = async (event: GlobalEvent): Promise<void> => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    applied.push(event.globalPosition);
    if (event.globalPosition === gateAt) {
      reached.fire();
      await release.promise;
    }
    active -= 1;
  };

  return {
    handler,
    reached: reached.promise,
    release: () => {
      release.fire();
    },
    applied,
    maxActive: () => maxActive,
  };
}
