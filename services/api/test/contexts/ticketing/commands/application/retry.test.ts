import type { DomainEventFact } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import { InMemoryEventStore } from "@api/contexts/ticketing/shared/infrastructure/in-memory-event-store.ts";

import { ConcurrencyError } from "@api/contexts/ticketing/commands/application/ports.ts";
import type {
  AppendResult,
  EventStore,
  ReadResult,
} from "@api/contexts/ticketing/commands/application/ports.ts";
import { heldFact, makeDeps, reserveCmd, scheduleCmd } from "./test-support.ts";
import {
  reserveSeats,
  scheduleShow,
} from "@api/contexts/ticketing/commands/application/use-cases.ts";

/**
 * Wraps a store to script append conflicts (D1-05 retry path). `shouldConflict(attempt)` decides
 * whether the Nth append conflicts; `interfere` optionally lets a competing writer move the stream
 * first, so the retry re-reads a genuinely changed stream.
 */
class ScriptedConflictStore implements EventStore {
  private appends = 0;

  constructor(
    private readonly inner: EventStore,
    private readonly shouldConflict: (attempt: number) => boolean,
    private readonly interfere?: (inner: EventStore, streamId: string) => Promise<void>,
  ) {}

  readStream(streamId: string): Promise<ReadResult> {
    return this.inner.readStream(streamId);
  }

  async appendToStream(
    streamId: string,
    expectedRevision: number,
    newFacts: readonly DomainEventFact[],
  ): Promise<AppendResult> {
    this.appends += 1;
    if (this.shouldConflict(this.appends)) {
      if (this.interfere) await this.interfere(this.inner, streamId);
      const { revision } = await this.inner.readStream(streamId);
      throw new ConcurrencyError(streamId, expectedRevision, revision);
    }
    return this.inner.appendToStream(streamId, expectedRevision, newFacts);
  }
}

describe("optimistic retry (D1-05)", () => {
  it("retries past a conflict and succeeds when the seat is still free", async () => {
    const inner = new InMemoryEventStore();
    await scheduleShow(makeDeps({ store: inner }), scheduleCmd("show-1", "A1", "A2"));

    // On the first append, a competing writer holds A2 (an unrelated seat), moving the revision.
    const competeOnA2 = async (store: EventStore, streamId: string): Promise<void> => {
      const { revision } = await store.readStream(streamId);
      await store.appendToStream(streamId, revision, [heldFact("other", "carol", 9_999_999, "A2")]);
    };
    const store = new ScriptedConflictStore(inner, (attempt) => attempt === 1, competeOnA2);

    const result = await reserveSeats(makeDeps({ store }), reserveCmd("show-1", "alice", "A1"));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.holdId).toBe("hold-1"); // stable id across the retry
    // Stream: ShowScheduled(0), competing SeatsHeld A2 (1), alice's SeatsHeld A1 (2).
    const read = await inner.readStream("show-1");
    expect(read.revision).toBe(2);
    expect(read.events.filter((event) => event.type === "SeatsHeld")).toHaveLength(2);
  });

  it("surfaces a typed Conflict after the retry budget is exhausted", async () => {
    const inner = new InMemoryEventStore();
    await scheduleShow(makeDeps({ store: inner }), scheduleCmd("show-1", "A1"));

    const alwaysConflict = new ScriptedConflictStore(inner, () => true); // every append conflicts
    const deps = makeDeps({ store: alwaysConflict, maxAttempts: 3 });

    const result = await reserveSeats(deps, reserveCmd("show-1", "alice", "A1"));

    expect(result).toEqual({ ok: false, error: { type: "Conflict" } });
    // Nothing was persisted beyond the schedule — no partial/double hold.
    expect((await inner.readStream("show-1")).revision).toBe(0);
  });
});
