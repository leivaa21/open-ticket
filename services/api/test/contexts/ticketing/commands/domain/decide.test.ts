import { describe, expect, it } from "vitest";

import { decide } from "@api/contexts/ticketing/commands/domain/decide.ts";
import { initialState } from "@api/contexts/ticketing/commands/domain/state.ts";
import {
  confirmPurchase,
  ctxAt,
  releaseHold,
  reserveSeats,
  run,
  scheduleShow,
} from "./fixtures.ts";

// A show scheduled with inventory A1, A2, B1 — the starting point for most rules.
const scheduled = run(initialState, scheduleShow("show-1", "A1", "A2", "B1"), ctxAt(0)).state;

describe("decide — ScheduleShow", () => {
  it("schedules a new show, emitting ShowScheduled with the inventory", () => {
    const { result } = run(initialState, scheduleShow("show-1", "A1", "A2"), ctxAt(0));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toEqual([
        { type: "ShowScheduled", payload: { seatIds: ["A1", "A2"] } },
      ]);
    }
  });

  it("rejects scheduling a show that already exists", () => {
    const { result } = run(scheduled, scheduleShow("show-1", "A1"), ctxAt(0));

    expect(result).toEqual({ ok: false, error: { type: "ShowAlreadyScheduled" } });
  });
});

describe("decide — ReserveSeats", () => {
  const alloc = { holdId: "hold-1", expiresAt: 600 };

  it("rejects reserving on a show that does not exist", () => {
    const { result } = run(initialState, reserveSeats("show-1", "buyer", "A1"), ctxAt(0, alloc));

    expect(result).toEqual({ ok: false, error: { type: "ShowNotFound" } });
  });

  it("rejects a seat not in the inventory, naming it", () => {
    const { result } = run(scheduled, reserveSeats("show-1", "buyer", "A1", "Z9"), ctxAt(0, alloc));

    expect(result).toEqual({ ok: false, error: { type: "UnknownSeat", seatIds: ["Z9"] } });
  });

  it("holds available seats atomically, emitting SeatsHeld with the allocated hold", () => {
    const { result } = run(scheduled, reserveSeats("show-1", "buyer", "A1", "A2"), ctxAt(0, alloc));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toEqual([
        {
          type: "SeatsHeld",
          payload: {
            holdId: "hold-1",
            seatIds: ["A1", "A2"],
            holderId: "buyer",
            expiresAt: 600,
          },
        },
      ]);
    }
  });

  it("throws when a ReserveSeats arrives without an allocated hold (wiring bug, not a rule)", () => {
    expect(() => decide(scheduled, reserveSeats("show-1", "buyer", "A1"), ctxAt(0))).toThrow(
      /ctx.newHold/,
    );
  });

  it("throws when the allocated holdId is already in use (wiring bug — would overwrite a hold)", () => {
    const withHold = run(scheduled, reserveSeats("show-1", "buyer", "A1"), ctxAt(0, alloc)).state;

    // A correct IdGenerator never reuses an id; a collision would silently overwrite the live
    // hold-1, so the domain rejects it as a wiring bug rather than trusting the allocation.
    expect(() => decide(withHold, reserveSeats("show-1", "other", "A2"), ctxAt(0, alloc))).toThrow(
      /already in use/,
    );
  });

  it("throws when the allocated hold is already expired at creation (expiresAt <= now)", () => {
    expect(() =>
      decide(
        scheduled,
        reserveSeats("show-1", "buyer", "A1"),
        ctxAt(600, { holdId: "hold-9", expiresAt: 600 }),
      ),
    ).toThrow(/already expired/);
  });
});

describe("decide — ConfirmPurchase", () => {
  const held = run(
    scheduled,
    reserveSeats("show-1", "buyer", "A1"),
    ctxAt(0, { holdId: "hold-1", expiresAt: 600 }),
  ).state;

  it("sells the seats of a live hold", () => {
    const { result } = run(held, confirmPurchase("show-1", "hold-1"), ctxAt(100));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toEqual([
        { type: "SeatsSold", payload: { holdId: "hold-1", seatIds: ["A1"] } },
      ]);
    }
  });

  it("rejects an unknown hold as HoldNotFound", () => {
    const { result } = run(held, confirmPurchase("show-1", "ghost"), ctxAt(100));

    expect(result).toEqual({ ok: false, error: { type: "HoldNotFound" } });
  });

  it("rejects a time-expired hold as HoldExpired (lazy expiry, D1-03)", () => {
    // expiresAt is 600; confirming at exactly 600 is already expired (live iff now < expiresAt).
    const { result } = run(held, confirmPurchase("show-1", "hold-1"), ctxAt(600));

    expect(result).toEqual({ ok: false, error: { type: "HoldExpired" } });
  });

  it("rejects confirming a released hold as HoldNotFound", () => {
    const released = run(held, releaseHold("show-1", "hold-1"), ctxAt(100)).state;
    const { result } = run(released, confirmPurchase("show-1", "hold-1"), ctxAt(200));

    expect(result).toEqual({ ok: false, error: { type: "HoldNotFound" } });
  });

  it("rejects confirming an already-sold hold as HoldNotFound (no live hold remains)", () => {
    const sold = run(held, confirmPurchase("show-1", "hold-1"), ctxAt(100)).state;
    const { result } = run(sold, confirmPurchase("show-1", "hold-1"), ctxAt(150));

    expect(result).toEqual({ ok: false, error: { type: "HoldNotFound" } });
  });
});

describe("decide — ReleaseHold", () => {
  const held = run(
    scheduled,
    reserveSeats("show-1", "buyer", "A1"),
    ctxAt(0, { holdId: "hold-1", expiresAt: 600 }),
  ).state;

  it("releases a live hold", () => {
    const { result } = run(held, releaseHold("show-1", "hold-1"), ctxAt(100));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toEqual([{ type: "HoldReleased", payload: { holdId: "hold-1" } }]);
    }
  });

  it("rejects releasing an unknown or already-released hold as HoldNotFound", () => {
    expect(run(held, releaseHold("show-1", "ghost"), ctxAt(100)).result).toEqual({
      ok: false,
      error: { type: "HoldNotFound" },
    });
    const released = run(held, releaseHold("show-1", "hold-1"), ctxAt(100)).state;
    expect(run(released, releaseHold("show-1", "hold-1"), ctxAt(200)).result).toEqual({
      ok: false,
      error: { type: "HoldNotFound" },
    });
  });

  it("rejects releasing a time-expired hold as HoldNotFound (nothing live to release)", () => {
    const { result } = run(held, releaseHold("show-1", "hold-1"), ctxAt(600));

    expect(result).toEqual({ ok: false, error: { type: "HoldNotFound" } });
  });
});
