import type { DomainEventFact } from "@open-ticket/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { held, released, scheduled, sold } from "../domain/fixtures.ts";
import type { SeatMapState } from "@api/contexts/ticketing/queries/domain/seat-map.ts";
import { InMemoryEventStore } from "@api/contexts/ticketing/shared/infrastructure/in-memory-event-store.ts";

import { Projector } from "@api/contexts/ticketing/queries/application/projector.ts";
import { NOT_PROJECTED } from "@api/contexts/ticketing/queries/application/read-model-store.ts";

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
    const store = new InMemoryEventStore();
    projector = new Projector({ log: store });
    await projector.settled();
    expect(projector.asOf()).toBe(NOT_PROJECTED); // nothing seen yet

    await seedShow(store, "show-1", [scheduled("A1", "A2"), held("h1", "alice", 600, "A1")]);
    await projector.settled();

    expect(rawStatus(projector.getSeatMap("show-1"), "A1")).toEqual({
      kind: "held",
      holdId: "h1",
      holderId: "alice",
      expiresAt: 600,
    });
    expect(rawStatus(projector.getSeatMap("show-1"), "A2")).toEqual({ kind: "available" });
    expect(projector.asOf()).toBe(1); // two events applied → positions 0 and 1
    expect(await projector.lag()).toBe(0);
  });

  it("returns undefined for a show it has not seen (PR3 maps to 404)", async () => {
    const store = new InMemoryEventStore();
    projector = new Projector({ log: store });
    await projector.settled();

    expect(projector.getSeatMap("never-scheduled")).toBeUndefined();
  });

  it("routes by streamId — two shows never cross-contaminate", async () => {
    const store = new InMemoryEventStore();
    await seedShow(store, "show-1", [scheduled("A1"), held("h1", "alice", 600, "A1")]);
    await seedShow(store, "show-2", [scheduled("A1"), sold("h9", "A1")]);

    projector = new Projector({ log: store });
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
    const incrementalStore = new InMemoryEventStore();
    const incremental = new Projector({ log: incrementalStore });
    for (const event of history) {
      await append(incrementalStore, "show-1", event);
      await incremental.settled();
    }

    // Rebuild: a fresh projector over a store already holding the whole history (replay from 0).
    const rebuiltStore = new InMemoryEventStore();
    await seedShow(rebuiltStore, "show-1", history);
    const rebuilt = new Projector({ log: rebuiltStore });
    await rebuilt.settled();

    expect(rebuilt.getSeatMap("show-1")).toEqual(incremental.getSeatMap("show-1"));
    expect(rebuilt.asOf()).toBe(incremental.asOf());

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
    const store = new InMemoryEventStore();
    const boom = new Error("reducer bug");
    projector = new Projector({
      log: store,
      reducer: () => {
        throw boom;
      },
    });

    await seedShow(store, "show-1", [scheduled("A1"), held("h1", "alice", 600, "A1")]);
    await projector.settled();

    expect(projector.isHealthy()).toBe(false);
    expect(projector.lastError()).toBe(boom);
    expect(projector.asOf()).toBe(NOT_PROJECTED); // did not advance past the failing event
    expect(projector.getSeatMap("show-1")).toBeUndefined();

    // A further commit is not projected — the subscription is stopped.
    await append(store, "show-1", held("h2", "bob", 900, "A1"));
    await projector.settled();
    expect(projector.asOf()).toBe(NOT_PROJECTED);
  });
});
