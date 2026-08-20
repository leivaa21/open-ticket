import { describe, expect, it } from "vitest";

import { DevAppended, DevLag, SeatMapView } from "./read-models.ts";

describe("DevAppended", () => {
  it("parses a well-formed appended frame", () => {
    const result = DevAppended.safeParse({ position: "3", type: "SeatsHeld", showId: "show-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-string position or type", () => {
    // A position is an opaque token, never a number (D4-01) — a client that sends one back as a
    // number has parsed it, which is exactly what the token forbids.
    expect(DevAppended.safeParse({ position: 3, type: "X", showId: "s" }).success).toBe(false);
    expect(DevAppended.safeParse({ position: "", type: "X", showId: "s" }).success).toBe(false);
    expect(DevAppended.safeParse({ position: "0", type: 5, showId: "s" }).success).toBe(false);
  });
});

describe("DevLag", () => {
  it("parses a caught-up snapshot and one that is behind", () => {
    expect(DevLag.safeParse({ behindMs: 0, behindEvents: 0 }).success).toBe(true);
    expect(DevLag.safeParse({ behindMs: 2412, behindEvents: 17 }).success).toBe(true);
  });

  it("accepts a frame with no event count — the store may not be able to produce one", () => {
    // EventStoreDB's positions are byte offsets, so it cannot count events behind. `behindMs` is
    // the unit every adapter can produce; `behindEvents` is a bonus, never a requirement.
    expect(DevLag.safeParse({ behindMs: 2412 }).success).toBe(true);
  });

  it("rejects a negative lag", () => {
    expect(DevLag.safeParse({ behindMs: -1 }).success).toBe(false);
    expect(DevLag.safeParse({ behindMs: 0, behindEvents: -1 }).success).toBe(false);
  });
});

describe("SeatMapView", () => {
  it("carries asOf as an opaque token, or null before anything is projected", () => {
    const seats = [{ seatId: "A1", status: "held" }];
    const showId = "11111111-2222-4333-8444-555555555555";
    expect(SeatMapView.safeParse({ showId, asOf: "42", seats }).success).toBe(true);
    expect(SeatMapView.safeParse({ showId, asOf: null, seats }).success).toBe(true);
    expect(SeatMapView.safeParse({ showId, asOf: 42, seats }).success).toBe(false);
  });
});
