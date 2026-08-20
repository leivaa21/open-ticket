import { describe, expect, it } from "vitest";

import { NO_STREAM } from "@api/contexts/ticketing/commands/application/ports.ts";
import type { Position } from "@api/contexts/ticketing/shared/application/index.ts";
import { InMemoryEventStore } from "@api/contexts/ticketing/shared/infrastructure/in-memory-event-store.ts";
import { LogPosition } from "@api/contexts/ticketing/shared/infrastructure/log-position.ts";
import { FixedClock, heldFact, newStore, seats } from "../../commands/application/test-support.ts";

const scheduledFact = () => ({ type: "ShowScheduled" as const, payload: { seatIds: seats("A1") } });

/** Positions are opaque to everything but the adapter — tests compare their tokens. */
const tokens = (positions: readonly Position[]): string[] => positions.map((p) => p.token);

/** Seed a store with a global log of `count` events spread across two streams; returns the store. */
async function seed(count: number): Promise<InMemoryEventStore> {
  const store = newStore();
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
  it("reads an empty log as a null head with no events", async () => {
    const store = newStore();

    const all = await store.readAll(null);

    expect(all.events).toEqual([]);
    // `null`, not 0: the head is the LAST appended position (D4-01), and an empty log has none.
    expect(all.head).toBeNull();
  });

  it("assigns monotonic positions across multiple streams in append order", async () => {
    const store = newStore();
    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]); // position 0
    await store.appendToStream("show-2", NO_STREAM, [scheduledFact()]); // position 1
    await store.appendToStream("show-1", 0, [heldFact("h1", "buyer", 999, "A1")]); // position 2

    const all = await store.readAll(null);

    expect(tokens(all.events.map((event) => event.position))).toEqual(["0", "1", "2"]);
    expect(all.events.map((event) => event.streamId)).toEqual(["show-1", "show-2", "show-1"]);
    expect(all.head?.token).toBe("2");
  });

  it("readAll(after) is EXCLUSIVE — it never re-delivers the event you already applied", async () => {
    const store = await seed(5);

    expect(tokens((await store.readAll(null)).events.map((e) => e.position))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
    // After position 1 → 2,3,4. Position 1 itself is excluded: a catch-up reader names where it
    // GOT TO, and an opaque position has no "+1" to ask for instead (D4-01).
    expect(tokens((await store.readAll(new LogPosition(1))).events.map((e) => e.position))).toEqual(
      ["2", "3", "4"],
    );
    expect((await store.readAll(new LogPosition(4))).events).toEqual([]); // from head → empty
    expect((await store.readAll(new LogPosition(4))).head?.token).toBe("4");
  });

  it("counts what is still unapplied — the optional courtesy only this adapter can offer", async () => {
    const store = await seed(5);

    expect(store.behindEvents(null)).toBe(5);
    expect(store.behindEvents(new LogPosition(1))).toBe(3);
    expect(store.behindEvents(new LogPosition(4))).toBe(0);
  });

  it("refuses a position from another log rather than reading from the top", async () => {
    const store = await seed(2);
    const foreign: Position = { token: "0", compareTo: () => 0 };

    // Silently treating an unknown position as "start of log" would re-deliver the whole history
    // to a subscription that had already applied it — a wiring bug must be loud.
    await expect(store.readAll(foreign)).rejects.toThrow(TypeError);
  });

  it("hands back a fresh array each read (defensive copy)", async () => {
    const store = await seed(2);

    const first = await store.readAll(null);
    const second = await store.readAll(null);

    expect(first.events).not.toBe(second.events);
    expect(first.events).toEqual(second.events);
  });
});

describe("InMemoryEventStore — recordedAt (D4-01)", () => {
  it("stamps every event from the injected clock, never Date.now()", async () => {
    const clock = new FixedClock(1_700_000_000_000);
    const store = new InMemoryEventStore(clock);

    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    const [event] = (await store.readAll(null)).events;

    expect(event?.recordedAt).toBe(1_700_000_000_000);
  });

  it("records events committed together at the same instant", async () => {
    const store = newStore();

    // One append, two facts: they are one commit, so they must not appear to span time.
    await store.appendToStream("show-1", NO_STREAM, [
      scheduledFact(),
      heldFact("h1", "buyer", 999, "A1"),
    ]);
    const recorded = (await store.readAll(null)).events.map((event) => event.recordedAt);

    expect(recorded).toEqual([1_000, 1_000]);
  });
});

describe("InMemoryEventStore — onCommitted (D2-02)", () => {
  it("wakes listeners after the event is in the log (a pull sees it)", async () => {
    const store = newStore();
    let observedHead: string | null | undefined;
    const off = store.onCommitted(() => {
      // A real subscriber pulls on wake; the pull must already see the new event.
      void store.readAll(null).then((all) => {
        observedHead = all.head?.token ?? null;
      });
    });

    await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    await Promise.resolve(); // let the listener's pull resolve

    expect(observedHead).toBe("0");
    off();
  });

  it("fires once per append and stops after unsubscribe", async () => {
    const store = newStore();
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
    const store = newStore();

    const appended = await store.appendToStream("show-1", NO_STREAM, [scheduledFact()]);
    const read = await store.readStream("show-1");

    expect(appended.revision).toBe(0);
    expect(appended.commitPosition.token).toBe("0");
    expect(read.revision).toBe(0);
    expect(read.events).toHaveLength(1);
  });
});
