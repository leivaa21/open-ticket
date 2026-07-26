import { describe, expect, it } from "vitest";

import { decide } from "@api/contexts/ticketing/commands/domain/decide.ts";
import { evolve, reconstitute } from "@api/contexts/ticketing/commands/domain/evolve.ts";
import { initialState } from "@api/contexts/ticketing/commands/domain/state.ts";
import type { ShowState } from "@api/contexts/ticketing/commands/domain/state.ts";
import {
  confirmPurchase,
  ctxAt,
  hold,
  holdExpiredEvent,
  holdReleasedEvent,
  play,
  releaseHold,
  reserveSeats,
  scheduleShow,
  seatsHeldEvent,
  seatsSoldEvent,
  showScheduledEvent,
} from "./fixtures.ts";

/** A comparable, order-independent snapshot of state for structural equality assertions. */
function snapshot(state: ShowState): unknown {
  if (!state.exists) return { exists: false };
  return {
    exists: true,
    seats: [...state.seats].sort(),
    soldSeats: [...state.soldSeats].sort(),
    holds: [...state.holds.entries()]
      .map(([id, h]) => [id, { ...h, seatIds: [...h.seatIds].sort() }] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  };
}

describe("reconstitute — fold a stream from the initial state", () => {
  it("an empty stream leaves the show non-existent", () => {
    expect(reconstitute([])).toEqual({ exists: false });
  });

  it("replays schedule → reserve → confirm into the expected sold state", () => {
    const state = reconstitute([
      showScheduledEvent("A1", "A2"),
      seatsHeldEvent("h1", "buyer", 600, "A1"),
      seatsSoldEvent("h1", "A1"),
    ]);

    expect(state.exists).toBe(true);
    if (state.exists) {
      expect([...state.soldSeats]).toEqual(["A1"]);
      expect(state.holds.get(hold("h1"))?.status).toBe("sold");
    }
  });
});

describe("evolve — folds HoldExpired even though no M1 command emits it (D1-03)", () => {
  const stream = [
    showScheduledEvent("A1"),
    seatsHeldEvent("h1", "buyer", 600, "A1"),
    holdExpiredEvent("h1"),
  ];

  it("marks the hold expired, so its seat is available again and confirm is rejected", () => {
    const state = reconstitute(stream);
    if (!state.exists) throw new Error("expected scheduled");
    expect(state.holds.get(hold("h1"))?.status).toBe("expired");

    // A confirm on the expired hold is rejected as HoldExpired.
    expect(decide(state, confirmPurchase("show-1", "h1"), ctxAt(100))).toEqual({
      ok: false,
      error: { type: "HoldExpired" },
    });

    // The seat is free again: reserving A1 now succeeds.
    const reserve = decide(
      state,
      reserveSeats("show-1", "buyer2", "A1"),
      ctxAt(100, { holdId: "h2", expiresAt: 700 }),
    );
    expect(reserve.ok).toBe(true);
  });
});

describe("fold-replay determinism", () => {
  it("reconstituting a stream equals building state incrementally, and the next decide matches", () => {
    const acts = [
      { command: scheduleShow("show-1", "A1", "A2", "B1"), ctx: ctxAt(0) },
      {
        command: reserveSeats("show-1", "alice", "A1"),
        ctx: ctxAt(10, { holdId: "hold-a", expiresAt: 610 }),
      },
      {
        command: reserveSeats("show-1", "bob", "B1"),
        ctx: ctxAt(20, { holdId: "hold-b", expiresAt: 620 }),
      },
      { command: confirmPurchase("show-1", "hold-a"), ctx: ctxAt(30) },
      { command: releaseHold("show-1", "hold-b"), ctx: ctxAt(40) },
    ];

    const { state: incremental, stream } = play(acts);
    const replayed = reconstitute(stream);

    // Same state whether folded incrementally or reconstituted from the persisted stream.
    expect(snapshot(replayed)).toEqual(snapshot(incremental));

    // And a further command decides identically against both.
    const next = reserveSeats("show-1", "carol", "B1");
    const ctx = ctxAt(50, { holdId: "hold-c", expiresAt: 650 });
    expect(decide(replayed, next, ctx)).toEqual(decide(incremental, next, ctx));
  });
});

describe("evolve — corrupt streams throw (a genuine bug, never produced by decide)", () => {
  it("throws when a hold event precedes ShowScheduled", () => {
    expect(() => evolve(initialState, seatsHeldEvent("h1", "x", 1, "A1"))).toThrow(
      /never scheduled/,
    );
  });

  it("throws when an event references a hold that was never held", () => {
    const scheduled = evolve(initialState, showScheduledEvent("A1"));

    expect(() => evolve(scheduled, holdReleasedEvent("ghost"))).toThrow(/never held/);
  });
});
