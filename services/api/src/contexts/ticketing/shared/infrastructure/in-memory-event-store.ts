import type { DomainEventFact, PersistedEvent } from "@open-ticket/contracts";

import { ConcurrencyError, NO_STREAM } from "../../commands/application/ports.ts";
import type { AppendResult, EventStore, ReadResult } from "../../commands/application/ports.ts";
import type {
  CommitListener,
  EventLog,
  GlobalEvent,
  ReadAllResult,
} from "../../queries/application/event-log.ts";
import type { Clock, Position } from "../application/index.ts";
import { LogPosition } from "./log-position.ts";

/**
 * In-memory store mirroring EventStoreDB semantics: per-stream arrays with expected-revision
 * append (D1-04, the write side) AND a global positioned `$all` log with catch-up reads +
 * commit wake-ups (D2-02, the read side). Both `EventStore` and `EventLog` are implemented here —
 * a single append lands the event in its stream and in the global log atomically (the body is
 * synchronous up to the mutation, so appends never interleave), then wakes commit listeners.
 * Faithful to the real store, so its client is a drop-in swap.
 *
 * It stamps each event's `recordedAt` from the injected `Clock` (D4-01) — the store owns that
 * timestamp, exactly as EventStoreDB owns `created`, and it is what makes projection lag
 * measurable in time. Through the port, never `Date.now()`: tests drive it.
 */
export class InMemoryEventStore implements EventStore, EventLog {
  private readonly streams = new Map<string, readonly PersistedEvent[]>();
  private readonly log: GlobalEvent[] = [];
  private readonly listeners = new Set<CommitListener>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  readStream(streamId: string): Promise<ReadResult> {
    const events = this.streams.get(streamId) ?? [];
    // Hand back a copy: a caller that casts away `readonly` can't corrupt the stored stream.
    return Promise.resolve({ events: [...events], revision: lastRevision(events) });
  }

  appendToStream(
    streamId: string,
    expectedRevision: number,
    newFacts: readonly DomainEventFact[],
  ): Promise<AppendResult> {
    const existing = this.streams.get(streamId) ?? [];
    const current = lastRevision(existing);
    if (current !== expectedRevision) {
      return Promise.reject(new ConcurrencyError(streamId, expectedRevision, current));
    }

    // One clock reading for the whole append: events committed together are recorded together, so
    // a batch can never appear to span time it did not.
    const recordedAt = this.clock.now();
    const appended = newFacts.map((fact, index): PersistedEvent => ({
      ...fact,
      streamId,
      revision: current + 1 + index,
      recordedAt,
    }));
    this.streams.set(streamId, [...existing, ...appended]);

    // Same atomic call: assign each event its global position and land it in the $all log.
    const base = this.log.length;
    this.log.push(
      ...appended.map((event, index): GlobalEvent => ({
        ...event,
        position: new LogPosition(base + index),
      })),
    );
    this.notifyCommitted();

    const commitPosition = this.log.at(-1)?.position;
    /* v8 ignore next 2 -- unreachable: an append of zero facts is rejected by the domain upstream */
    if (commitPosition === undefined) throw new Error("append produced no events");

    return Promise.resolve({ revision: current + newFacts.length, commitPosition });
  }

  readAll(after: Position | null): Promise<ReadAllResult> {
    const foreign = foreignPositionError(after);
    // Rejects rather than throwing synchronously, the same way `appendToStream` reports a
    // conflict — an async-shaped port method must fail asynchronously.
    if (foreign !== undefined) return Promise.reject(foreign);
    // Exclusive: everything strictly after `after`. `slice` also hands back a fresh array
    // (defensive copy), matching `readStream`.
    return Promise.resolve({ events: this.log.slice(this.indexAfter(after)), head: this.head() });
  }

  head(): Position | null {
    return this.log.at(-1)?.position ?? null;
  }

  behindEvents(after: Position | null): number {
    const foreign = foreignPositionError(after);
    if (foreign !== undefined) throw foreign; // sync method, sync failure
    return this.log.length - this.indexAfter(after);
  }

  /**
   * The array index of the first event strictly after `after` — the one place this adapter uses
   * the fact that its positions are indices. Total by construction: callers guard first.
   */
  private indexAfter(after: Position | null): number {
    return after instanceof LogPosition ? after.index + 1 : 0;
  }

  onCommitted(listener: CommitListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyCommitted(): void {
    // The port contract says a listener must not throw; this guard is defense-in-depth so a
    // misbehaving subscriber can't corrupt an already-persisted append or starve its peers. A
    // swallowed throw re-surfaces out of band (a bug, not a store fault) without failing the write.
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}

/**
 * A position this log never issued is a wiring bug, not a data case: treating it as "start of the
 * log" would silently re-deliver the entire history to a subscription that had already applied it.
 */
function foreignPositionError(position: Position | null): TypeError | undefined {
  return position === null || position instanceof LogPosition
    ? undefined
    : new TypeError(`not a position from this log: "${position.token}"`);
}

/** The last event's revision, or `NO_STREAM` for an empty stream. */
function lastRevision(events: readonly PersistedEvent[]): number {
  const last = events.at(-1);
  return last === undefined ? NO_STREAM : last.revision;
}
