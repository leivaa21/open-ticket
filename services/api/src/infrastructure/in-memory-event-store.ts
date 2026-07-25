import type { DomainEventFact, PersistedEvent } from "@open-ticket/contracts";

import { ConcurrencyError, NO_STREAM } from "../application/ports.ts";
import type { AppendResult, EventStore, ReadResult } from "../application/ports.ts";

/**
 * In-memory `EventStore` mirroring EventStoreDB semantics (D1-04): one immutable array per stream,
 * a per-stream read, and an append that enforces the expected revision. The append body is
 * synchronous (no `await` before the mutation), so no two appends interleave — it is atomic per
 * call, which is what makes the concurrency test deterministic. Faithfully reproducing the
 * expected-revision conflict is the point: the real EventStoreDB client is a drop-in swap.
 */
export class InMemoryEventStore implements EventStore {
  private readonly streams = new Map<string, readonly PersistedEvent[]>();

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
    return Promise.resolve({ revision: current + newFacts.length });
  }
}

/** The last event's revision, or `NO_STREAM` for an empty stream. */
function lastRevision(events: readonly PersistedEvent[]): number {
  const last = events.at(-1);
  return last === undefined ? NO_STREAM : last.revision;
}
