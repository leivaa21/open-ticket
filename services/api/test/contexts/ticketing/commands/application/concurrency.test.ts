import type { DomainEventFact } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import type {
  AppendResult,
  EventStore,
  ReadResult,
} from "@api/contexts/ticketing/commands/application/ports.ts";
import {
  confirmCmd,
  makeDeps,
  newStore,
  reserveCmd,
  scheduleCmd,
  SequentialIds,
} from "./test-support.ts";
import {
  confirmPurchase,
  reserveSeats,
  scheduleShow,
} from "@api/contexts/ticketing/commands/application/use-cases.ts";

/**
 * Store wrapper that turns the race deterministic: no `appendToStream` proceeds until every racer
 * has read (the barrier), guaranteeing both read the SAME revision before either writes. That
 * forces a genuine expected-revision conflict rather than relying on scheduling luck — whichever
 * append lands second conflicts and must retry. The outcome invariant (exactly one winner) then
 * holds regardless of which racer wins.
 */
class BarrierStore implements EventStore {
  private reads = 0;
  private readonly bothRead: Promise<void>;
  private readonly release: () => void;

  constructor(
    private readonly inner: EventStore,
    private readonly racers: number,
  ) {
    let signal = (): void => undefined;
    this.bothRead = new Promise<void>((resolve) => {
      signal = resolve;
    });
    this.release = signal;
  }

  async readStream(streamId: string): Promise<ReadResult> {
    const result = await this.inner.readStream(streamId);
    this.reads += 1;
    if (this.reads >= this.racers) this.release();
    return result;
  }

  async appendToStream(
    streamId: string,
    expectedRevision: number,
    newFacts: readonly DomainEventFact[],
  ): Promise<AppendResult> {
    await this.bothRead;
    return this.inner.appendToStream(streamId, expectedRevision, newFacts);
  }
}

describe("THE concurrency race — two reservations for the same seat (D1-05)", () => {
  it("lets exactly one win; the other retries, re-reads, and fails SeatsUnavailable", async () => {
    const inner = newStore();
    await scheduleShow(makeDeps({ store: inner }), scheduleCmd("show-1", "A1", "A2"));

    const store = new BarrierStore(inner, 2);
    // One shared id generator, as a real UuidGenerator is one process-wide source of globally
    // unique ids (the D1-07 contract). Distinct ids per racer — so the loser retries on the
    // availability rule, never on the domain's holdId-uniqueness guard.
    const ids = new SequentialIds();
    const alice = makeDeps({ store, ids });
    const bob = makeDeps({ store, ids });

    // Both read revision 0, both try to append at revision 0 — the store's ConcurrencyError forces
    // the loser to retry, re-read (now seeing the winner's SeatsHeld), and reject.
    const [a, b] = await Promise.all([
      reserveSeats(alice, reserveCmd("show-1", "alice", "A1")),
      reserveSeats(bob, reserveCmd("show-1", "bob", "A1")),
    ]);

    const outcomes = [a, b];
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);

    const losers = outcomes.filter((result) => !result.ok);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, error: { type: "SeatsUnavailable", seatIds: ["A1"] } });

    // The invariant on disk: A1 is held exactly once — no double-hold.
    const events = (await inner.readStream("show-1")).events;
    const a1Holds = events.filter(
      (event) => event.type === "SeatsHeld" && event.payload.seatIds.map(String).includes("A1"),
    );
    expect(a1Holds).toHaveLength(1);
  });

  it("lets exactly one confirm sell a hold; the other retries and fails HoldNotFound (no double-sell)", async () => {
    const inner = newStore();
    const setup = makeDeps({ store: inner });
    await scheduleShow(setup, scheduleCmd("show-1", "A1"));
    const reserved = await reserveSeats(setup, reserveCmd("show-1", "alice", "A1"));
    expect(reserved.ok).toBe(true);
    const hold = reserved.ok ? String(reserved.value.holdId) : "";

    // Two buyers race to confirm the SAME hold; both read the post-reserve revision before either
    // appends, so the loser's SeatsSold conflicts, retries, re-reads the sold hold, and rejects.
    const store = new BarrierStore(inner, 2);
    const [a, b] = await Promise.all([
      confirmPurchase(makeDeps({ store }), confirmCmd("show-1", hold)),
      confirmPurchase(makeDeps({ store }), confirmCmd("show-1", hold)),
    ]);

    const outcomes = [a, b];
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
    const losers = outcomes.filter((result) => !result.ok);
    expect(losers).toEqual([{ ok: false, error: { type: "HoldNotFound" } }]);

    // The invariant on disk: the hold is sold exactly once — no double-sell.
    const events = (await inner.readStream("show-1")).events;
    expect(events.filter((event) => event.type === "SeatsSold")).toHaveLength(1);
  });
});
