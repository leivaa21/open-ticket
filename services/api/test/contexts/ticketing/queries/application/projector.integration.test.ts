import type { DomainEventFact } from "@open-ticket/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { held, released, scheduled, sold } from "../domain/fixtures.ts";
import type { SeatMapState } from "@api/contexts/ticketing/queries/domain/seat-map.ts";
import { InMemoryEventStore } from "@api/contexts/ticketing/shared/infrastructure/in-memory-event-store.ts";

import type { EventLog } from "@api/contexts/ticketing/queries/application/event-log.ts";
import { Projector } from "@api/contexts/ticketing/queries/application/projector.ts";
import type { Scheduler } from "@api/contexts/ticketing/queries/application/subscription.ts";
import { MutableClock } from "../../../../app/test-server.ts";

/** A store on a controllable clock — every event's `recordedAt` comes from it (D4-01). */
const newStore = (clock: MutableClock): InMemoryEventStore => new InMemoryEventStore(clock);

/** Append one fact to a stream at its current revision (single writer in tests → no conflict). */
async function append(
  store: InMemoryEventStore,
  showId: string,
  fact: DomainEventFact,
): Promise<void> {
  const { revision } = await store.readStream(showId);
  await store.appendToStream(showId, revision, [fact]);
}

/** Feed a whole show's history to a store. */
async function seedShow(
  store: InMemoryEventStore,
  showId: string,
  events: readonly DomainEventFact[],
): Promise<void> {
  for (const event of events) await append(store, showId, event);
}

const rawStatus = (state: SeatMapState | undefined, seatId: string) =>
  state?.seats.get(seatId as never);

describe("Projector — catch-up and live projection (D2-01)", () => {
  let projector: Projector | undefined;

  afterEach(() => {
    projector?.stop();
    projector = undefined;
  });

  it("projects a live reservation and advances asOf", async () => {
    const clock = new MutableClock(1_000);
    const store = newStore(clock);
    projector = new Projector({ log: store, clock });
    await projector.settled();
    expect(projector.asOf()).toBeNull(); // nothing seen yet

    await seedShow(store, "show-1", [scheduled("A1", "A2"), held("h1", "alice", 600, "A1")]);
    await projector.settled();

    expect(rawStatus(projector.getSeatMap("show-1"), "A1")).toEqual({
      kind: "held",
      holdId: "h1",
      holderId: "alice",
      expiresAt: 600,
    });
    expect(rawStatus(projector.getSeatMap("show-1"), "A2")).toEqual({ kind: "available" });
    expect(projector.asOf()?.token).toBe("1"); // two events applied → positions 0 and 1
    expect(projector.lagSnapshot()).toEqual({ behindMs: 0, behindEvents: 0 });
  });

  it("returns undefined for a show it has not seen (PR3 maps to 404)", async () => {
    const clock = new MutableClock(1_000);
    projector = new Projector({ log: newStore(clock), clock });
    await projector.settled();

    expect(projector.getSeatMap("never-scheduled")).toBeUndefined();
  });

  it("routes by streamId — two shows never cross-contaminate", async () => {
    const clock = new MutableClock(1_000);
    const store = newStore(clock);
    await seedShow(store, "show-1", [scheduled("A1"), held("h1", "alice", 600, "A1")]);
    await seedShow(store, "show-2", [scheduled("A1"), sold("h9", "A1")]);

    projector = new Projector({ log: store, clock });
    await projector.settled();

    expect(rawStatus(projector.getSeatMap("show-1"), "A1")).toMatchObject({ kind: "held" });
    expect(rawStatus(projector.getSeatMap("show-2"), "A1")).toEqual({ kind: "sold" });
  });

  it("rebuild-from-0 equals incremental projection", async () => {
    const history = [
      scheduled("A1", "A2"),
      held("h1", "alice", 600, "A1"),
      released("h1"),
      held("h2", "bob", 900, "A1"),
      sold("h2", "A1"),
    ];

    // Incremental: append + settle one event at a time.
    const clock = new MutableClock(1_000);
    const incrementalStore = newStore(clock);
    const incremental = new Projector({ log: incrementalStore, clock });
    for (const event of history) {
      await append(incrementalStore, "show-1", event);
      await incremental.settled();
    }

    // Rebuild: a fresh projector over a store already holding the whole history (replay from the
    // start of the log).
    const rebuiltStore = newStore(clock);
    await seedShow(rebuiltStore, "show-1", history);
    const rebuilt = new Projector({ log: rebuiltStore, clock });
    await rebuilt.settled();

    expect(rebuilt.getSeatMap("show-1")).toEqual(incremental.getSeatMap("show-1"));
    expect(rebuilt.asOf()?.token).toBe(incremental.asOf()?.token);

    incremental.stop();
    rebuilt.stop();
  });
});

describe("Projector — health (surfaces a dead projection)", () => {
  let projector: Projector | undefined;

  afterEach(() => {
    projector?.stop();
    projector = undefined;
  });

  it("a reducer throw stops the projector and shows as unhealthy — reads do not advance", async () => {
    const clock = new MutableClock(1_000);
    const store = newStore(clock);
    const boom = new Error("reducer bug");
    projector = new Projector({
      log: store,
      clock,
      reducer: () => {
        throw boom;
      },
    });

    await seedShow(store, "show-1", [scheduled("A1"), held("h1", "alice", 600, "A1")]);
    await projector.settled();

    expect(projector.isHealthy()).toBe(false);
    expect(projector.lastError()).toBe(boom);
    expect(projector.asOf()).toBeNull(); // did not advance past the failing event
    expect(projector.getSeatMap("show-1")).toBeUndefined();

    // A further commit is not projected — the subscription is stopped.
    await append(store, "show-1", held("h2", "bob", 900, "A1"));
    await projector.settled();
    expect(projector.asOf()).toBeNull();
  });
});

/** Holds every scheduled pump until released — freezes the projector exactly where a test wants it. */
class ManualScheduler implements Scheduler {
  private readonly tasks: (() => void)[] = [];

  schedule(task: () => void): void {
    this.tasks.push(task);
  }

  /** Run everything queued so far (a task may queue more; those wait for the next call). */
  runAll(): void {
    for (const task of this.tasks.splice(0)) task();
  }
}

describe("Projector — lag in time (D4-01)", () => {
  let projector: Projector | undefined;

  afterEach(() => {
    projector?.stop();
    projector = undefined;
  });

  it("measures staleness from the projector's start before it has applied anything", async () => {
    const clock = new MutableClock(1_000);
    const store = newStore(clock);
    const scheduler = new ManualScheduler(); // the projector never gets to run
    projector = new Projector({ log: store, clock, scheduler });

    await seedShow(store, "show-1", [scheduled("A1"), held("h1", "alice", 600, "A1")]);
    clock.set(3_000);

    // Nothing applied, but the log holds events: reporting 0 here would claim "caught up" while
    // the read model is empty. With no `recordedAt` to measure from, the honest floor is how long
    // this projector has been failing to keep up.
    expect(projector.asOf()).toBeNull();
    expect(projector.lagSnapshot()).toEqual({ behindMs: 2_000, behindEvents: 2 });
  });

  it("measures staleness from the last applied event once it has applied one", async () => {
    const clock = new MutableClock(1_000);
    const store = newStore(clock);
    const scheduler = new ManualScheduler();
    projector = new Projector({ log: store, clock, scheduler });

    await seedShow(store, "show-1", [scheduled("A1")]); // recorded at 1_000
    scheduler.runAll();
    await projector.settled();
    expect(projector.lagSnapshot()).toEqual({ behindMs: 0, behindEvents: 0 }); // reached the head

    clock.set(1_500);
    await seedShow(store, "show-1", [held("h1", "alice", 600, "A1")]); // recorded at 1_500, unapplied
    clock.set(4_000);

    // The read model still shows what it knew at 1_000, so that is what it is behind by — the
    // number a human reads as "the projection is 3s behind", and the one every adapter can produce.
    expect(projector.lagSnapshot()).toEqual({ behindMs: 3_000, behindEvents: 1 });

    scheduler.runAll();
    await projector.settled();
    expect(projector.lagSnapshot()).toEqual({ behindMs: 0, behindEvents: 0 });
  });

  it("omits the event count entirely when the store cannot produce one", async () => {
    const clock = new MutableClock(1_000);
    const store = newStore(clock);
    await seedShow(store, "show-1", [scheduled("A1")]);

    // An EventStoreDB-shaped log: byte-offset positions, so no free event count. `behindEvents` is
    // optional on the port precisely so such an adapter omits it — never reports a misleading 0.
    const countless: EventLog = {
      readAll: (after) => store.readAll(after),
      head: () => store.head(),
      onCommitted: (listener) => store.onCommitted(listener),
    };
    const scheduler = new ManualScheduler();
    projector = new Projector({ log: countless, clock, scheduler });
    clock.set(2_500);

    const snapshot = projector.lagSnapshot();
    expect(snapshot).toEqual({ behindMs: 1_500 });
    expect("behindEvents" in snapshot).toBe(false);
  });
});
