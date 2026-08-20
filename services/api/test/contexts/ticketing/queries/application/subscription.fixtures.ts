import type {
  EventLog,
  GlobalEvent,
  ReadAllResult,
} from "@api/contexts/ticketing/queries/application/event-log.ts";
import type { Position } from "@api/contexts/ticketing/shared/application/index.ts";
import { LogPosition } from "@api/contexts/ticketing/shared/infrastructure/log-position.ts";
import { heldFact } from "../../commands/application/test-support.ts";

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
    const index = this.log.length;
    this.log.push({
      ...heldFact(`h${String(index)}`, "buyer", 999, "A1"),
      streamId: "show-1",
      revision: index,
      // Distinct per event and increasing, so a test can assert `behindMs` moved without caring
      // which event supplied the timestamp.
      recordedAt: 1_000 + index,
      position: new LogPosition(index),
    });
  }

  /** Exclusive, like the real port: everything strictly after `after` (`null` = from the start). */
  readAll(after: Position | null): Promise<ReadAllResult> {
    this.readAllCalls += 1;
    return Promise.resolve({ events: this.log.slice(indexAfter(after)), head: this.head() });
  }

  head(): Position | null {
    return this.log.at(-1)?.position ?? null;
  }

  behindEvents(after: Position | null): number {
    return this.log.length - indexAfter(after);
  }

  onCommitted(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** The index a position points at, or `null` for "nothing applied yet" — for test assertions. */
export function appliedIndex(position: Position | null): number | null {
  return position === null ? null : positionIndex(position);
}

/** The array index a position points at — the fixture's own knowledge of its own log. */
function positionIndex(position: Position): number {
  if (!(position instanceof LogPosition)) throw new TypeError("not a FakeLog position");
  return position.index;
}

/** Index of the first event strictly after `after`. */
function indexAfter(after: Position | null): number {
  return after === null ? 0 : positionIndex(after) + 1;
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
    applied.push(positionIndex(event.position));
    if (positionIndex(event.position) === gateAt) {
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
