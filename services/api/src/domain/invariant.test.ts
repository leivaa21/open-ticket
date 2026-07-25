import { describe, expect, it } from "vitest";

import { initialState } from "./state.ts";
import {
  confirmPurchase,
  ctxAt,
  releaseHold,
  reserveSeats,
  run,
  scheduleShow,
} from "./fixtures.ts";

/**
 * THE invariant this whole PR exists to prove (D1-01): a seat is never in two live holds and
 * never sold twice. These are the adversarial paths — racing reservations, re-holding a sold
 * seat, confirming a stale hold, and lazy-expiry/release freeing a seat.
 */

const scheduled = run(initialState, scheduleShow("show-1", "A1", "A2", "B1"), ctxAt(0)).state;

// alice holds A1 under hold-a, expiring at 600 — the contested starting point.
const aliceHoldsA1 = run(
  scheduled,
  reserveSeats("show-1", "alice", "A1"),
  ctxAt(0, { holdId: "hold-a", expiresAt: 600 }),
).state;

const bobReserves = (state: typeof aliceHoldsA1, now: number, seatNames: string[]) =>
  run(
    state,
    reserveSeats("show-1", "bob", ...seatNames),
    ctxAt(now, { holdId: "hold-b", expiresAt: now + 600 }),
  );

describe("a seat is never in two live holds, never sold twice", () => {
  it("a second reservation for an overlapping seat fails while the first hold is live", () => {
    const { result } = bobReserves(aliceHoldsA1, 100, ["A1", "A2"]);

    expect(result).toEqual({ ok: false, error: { type: "SeatsUnavailable", seatIds: ["A1"] } });
  });

  it("a sold seat can never be re-held (reserve → confirm → reserve-same fails)", () => {
    const sold = run(aliceHoldsA1, confirmPurchase("show-1", "hold-a"), ctxAt(100)).state;

    const { result } = bobReserves(sold, 200, ["A1"]);

    expect(result).toEqual({ ok: false, error: { type: "SeatsUnavailable", seatIds: ["A1"] } });
  });

  it("a sold seat can never be re-sold: confirming a stale hold on it yields HoldExpired", () => {
    // alice's hold expires at 600; at now=700 it is dead, so bob reserves and buys A1.
    const bobHeld = bobReserves(aliceHoldsA1, 700, ["A1"]).state;
    const bobSold = run(bobHeld, confirmPurchase("show-1", "hold-b"), ctxAt(800)).state;

    // alice tries to confirm her long-dead hold on the now-sold seat — rejected, no double-sell.
    const { result } = run(bobSold, confirmPurchase("show-1", "hold-a"), ctxAt(900));

    expect(result).toEqual({ ok: false, error: { type: "HoldExpired" } });
    if (bobSold.exists) expect([...bobSold.soldSeats]).toEqual(["A1"]); // sold to exactly one hold
  });

  it("lazy expiry frees a seat: reserve → (time passes) → reserve-same succeeds", () => {
    const { result } = bobReserves(aliceHoldsA1, 600, ["A1"]); // now === expiresAt ⇒ alice dead

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events[0]?.type).toBe("SeatsHeld");
  });

  it("explicit release frees a seat: reserve → release → reserve-same succeeds", () => {
    const released = run(aliceHoldsA1, releaseHold("show-1", "hold-a"), ctxAt(100)).state;

    expect(bobReserves(released, 200, ["A1"]).result.ok).toBe(true);
  });
});
