import { describe, expect, it } from "vitest";

import { ConcurrencyError, NO_STREAM } from "../application/ports.ts";
import { heldFact, scheduleCmd } from "../application/test-support.ts";

import { InMemoryEventStore } from "./in-memory-event-store.ts";

const scheduledFact = () => {
  const command = scheduleCmd("show-1", "A1", "A2");
  return { type: "ShowScheduled" as const, payload: { seatIds: command.seatIds } };
};

describe("InMemoryEventStore — EventStoreDB fidelity (D1-04)", () => {
  it("reads an empty/absent stream as NO_STREAM with no events", async () => {
    const store = new InMemoryEventStore();

    const read = await store.readStream("show-1");

    expect(read.events).toEqual([]);
    expect(read.revision).toBe(NO_STREAM);
  });

  it("creates a stream (expected NO_STREAM) and assigns 0-based revisions", async () => {
    const store = new InMemoryEventStore();

    const first = await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    expect(first).toEqual({ revision: 0, globalPosition: 0 });

    const second = await store.appendToStream("show-1", 0, [heldFact("h1", "buyer", 999, "A1")]);
    expect(second).toEqual({ revision: 1, globalPosition: 1 });

    const read = await store.readStream("show-1");
    expect(read.revision).toBe(1);
    expect(read.events).toHaveLength(2);
    expect(read.events[0]).toMatchObject({
      type: "ShowScheduled",
      streamId: "show-1",
      revision: 0,
    });
    expect(read.events[1]).toMatchObject({ type: "SeatsHeld", streamId: "show-1", revision: 1 });
  });

  it("throws ConcurrencyError when the expected revision has moved", async () => {
    const store = new InMemoryEventStore();
    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]); // stream now at revision 0

    // Two writers both read revision 0 and both try to append expecting 0.
    await store.appendToStream("show-1", 0, [heldFact("h1", "alice", 999, "A1")]); // wins → revision 1
    const conflict = await store
      .appendToStream("show-1", 0, [heldFact("h2", "bob", 999, "A1")])
      .catch((error: unknown) => error);

    expect(conflict).toBeInstanceOf(ConcurrencyError);
    if (conflict instanceof ConcurrencyError) {
      expect(conflict.expectedRevision).toBe(0);
      expect(conflict.actualRevision).toBe(1);
    }
  });

  it("rejecting a conflicting append does not mutate the stream", async () => {
    const store = new InMemoryEventStore();
    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);

    await store
      .appendToStream("show-1", 5, [heldFact("h1", "alice", 999, "A1")]) // wrong expected revision
      .catch(() => undefined);

    const read = await store.readStream("show-1");
    expect(read.revision).toBe(0); // unchanged
    expect(read.events).toHaveLength(1);
  });

  it("keeps streams isolated by id", async () => {
    const store = new InMemoryEventStore();
    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);

    expect((await store.readStream("show-2")).revision).toBe(NO_STREAM);
    expect((await store.readStream("show-1")).revision).toBe(0);
  });
});
