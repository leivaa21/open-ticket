import type { DomainEventFact, PersistedEvent } from "@open-ticket/contracts";

import type {
  CommitListener,
  EventLog,
  GlobalEvent,
  ReadAllResult,
} from "../application/event-log.ts";
import { ConcurrencyError, NO_STREAM } from "../application/ports.ts";
import type { AppendResult, EventStore, ReadResult } from "../application/ports.ts";

/**
 * In-memory store mirroring EventStoreDB semantics: per-stream arrays with expected-revision
 * append (D1-04, the write side) AND a global positioned `$all` log with catch-up reads +
 * commit wake-ups (D2-02, the read side). Both `EventStore` and `EventLog` are implemented here —
 * a single append lands the event in its stream and in the global log atomically (the body is
 * synchronous up to the mutation, so appends never interleave), then wakes commit listeners.
 * Faithful to the real store, so its client is a drop-in swap.
 */
export class InMemoryEventStore implements EventStore, EventLog {
  private readonly streams = new Map<string, readonly PersistedEvent[]>();
  private readonly log: GlobalEvent[] = [];
  private readonly listeners = new Set<CommitListener>();

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

    const appended = newFacts.map((fact, index): PersistedEvent => ({
      ...fact,
      streamId,
      revision: current + 1 + index,
    }));
    this.streams.set(streamId, [...existing, ...appended]);

    // Same atomic call: assign each event its global position and land it in the $all log.
    const base = this.log.length;
    this.log.push(
      ...appended.map((event, index): GlobalEvent => ({ ...event, globalPosition: base + index })),
    );
    this.notifyCommitted();

    return Promise.resolve({
      revision: current + newFacts.length,
      globalPosition: base + newFacts.length - 1, // the last appended event's global position
    });
  }

  readAll(fromPosition: number): Promise<ReadAllResult> {
    // Positions are contiguous and 0-based, so array index === globalPosition. `slice` also hands
    // back a fresh array (defensive copy), matching `readStream`.
    return Promise.resolve({
      events: this.log.slice(Math.max(0, fromPosition)),
      head: this.log.length,
    });
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

/** The last event's revision, or `NO_STREAM` for an empty stream. */
function lastRevision(events: readonly PersistedEvent[]): number {
  const last = events.at(-1);
  return last === undefined ? NO_STREAM : last.revision;
}
