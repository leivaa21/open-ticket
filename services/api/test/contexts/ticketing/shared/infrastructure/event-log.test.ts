import { describe, expect, it } from "vitest";

import { NO_STREAM } from "@api/contexts/ticketing/commands/application/ports.ts";
import { heldFact, seats } from "../../commands/application/test-support.ts";

import { InMemoryEventStore } from "@api/contexts/ticketing/shared/infrastructure/in-memory-event-store.ts";

const scheduledFact = () => ({ type: "ShowScheduled" as const, payload: { seatIds: seats("A1") } });

/** Seed a store with a global log of `count` events spread across two streams; returns the store. */
async function seed(count: number): Promise<InMemoryEventStore> {
  const store = new InMemoryEventStore();
  for (let index = 0; index < count; index += 1) {
    const streamId = index % 2 === 0 ? "show-1" : "show-2";
    const revision = await store.readStream(streamId).then((read) => read.revision);
    await store.appendToStream(streamId, revision, [
      heldFact(`h${String(index)}`, "buyer", 999, "A1"),
    ]);
  }
  return store;
}

describe("InMemoryEventStore — the $all log (D2-02)", () => {
  it("reads an empty log as head 0 with no events", async () => {
    const store = new InMemoryEventStore();

    const all = await store.readAll(0);

    expect(all.events).toEqual([]);
    expect(all.head).toBe(0);
  });

  it("assigns monotonic 0-based positions across multiple streams in append order", async () => {
    const store = new InMemoryEventStore();
    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]); // position 0
    await store.appendToStream("show-2", NO_STREAM, [scheduledFact()]); // position 1
    await store.appendToStream("show-1", 0, [heldFact("h1", "buyer", 999, "A1")]); // position 2

    const all = await store.readAll(0);

    expect(all.events.map((event) => event.globalPosition)).toEqual([0, 1, 2]);
    expect(all.events.map((event) => event.streamId)).toEqual(["show-1", "show-2", "show-1"]);
    expect(all.head).toBe(3);
  });

  it("readAll(from) returns only events at or after the position", async () => {
    const store = await seed(5);

    expect((await store.readAll(0)).events.map((event) => event.globalPosition)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect((await store.readAll(2)).events.map((event) => event.globalPosition)).toEqual([2, 3, 4]);
    expect((await store.readAll(5)).events).toEqual([]); // from head → empty
    expect((await store.readAll(5)).head).toBe(5);
  });

  it("hands back a fresh array each read (defensive copy)", async () => {
    const store = await seed(2);

    const first = await store.readAll(0);
    const second = await store.readAll(0);

    expect(first.events).not.toBe(second.events);
    expect(first.events).toEqual(second.events);
  });
});

describe("InMemoryEventStore — onCommitted (D2-02)", () => {
  it("wakes listeners after the event is in the log (a pull sees it)", async () => {
    const store = new InMemoryEventStore();
    let observedHead: number | undefined;
    const off = store.onCommitted(() => {
      // A real subscriber pulls on wake; the pull must already see the new event.
      void store.readAll(0).then((all) => {
        observedHead = all.head;
      });
    });

    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    await Promise.resolve(); // let the listener's pull resolve

    expect(observedHead).toBe(1);
    off();
  });

  it("fires once per append and stops after unsubscribe", async () => {
    const store = new InMemoryEventStore();
    let wakeups = 0;
    const off = store.onCommitted(() => {
      wakeups += 1;
    });

    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    await store.appendToStream("show-1", 0, [heldFact("h1", "buyer", 999, "A1")]);
    expect(wakeups).toBe(2);

    off();
    await store.appendToStream("show-1", 1, [heldFact("h2", "buyer", 999, "A2")]);
    expect(wakeups).toBe(2); // no further wake-ups after unsubscribe
  });

  it("still serves the write side unchanged (readStream/append revisions)", async () => {
    const store = new InMemoryEventStore();

    const appended = await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    const read = await store.readStream("show-1");

    expect(appended.revision).toBe(0);
    expect(read.revision).toBe(0);
    expect(read.events).toHaveLength(1);
  });
});
