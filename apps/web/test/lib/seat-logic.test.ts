import type { SeatStatus, SeatView } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import {
  actionsFor,
  countByStatus,
  holdGone,
  isInteractive,
  ownershipOf,
  pruneHolds,
  toRows,
} from "@/lib/seat-logic.ts";
import type { Holds } from "@/lib/seat-logic.ts";

const seat = (seatId: string, status: SeatStatus): SeatView => ({ seatId, status }) as SeatView;
const holds = (...pairs: [string, string][]): Holds => new Map(pairs);

describe("ownershipOf", () => {
  it("is none for available and sold seats", () => {
    expect(ownershipOf(seat("A1", "available"), holds())).toBe("none");
    expect(ownershipOf(seat("A1", "sold"), holds(["A1", "h1"]))).toBe("none");
  });

  it("is mine for a held seat I hold, other for a held seat I don't", () => {
    expect(ownershipOf(seat("A1", "held"), holds(["A1", "h1"]))).toBe("mine");
    expect(ownershipOf(seat("A1", "held"), holds())).toBe("other");
  });
});

describe("actionsFor / isInteractive", () => {
  it("offers reserve on an available seat", () => {
    expect(actionsFor(seat("A1", "available"), "none")).toEqual(["reserve"]);
    expect(isInteractive(seat("A1", "available"), "none")).toBe(true);
  });

  it("offers confirm + release on my hold", () => {
    expect(actionsFor(seat("A1", "held"), "mine")).toEqual(["confirm", "release"]);
  });

  it("offers nothing (not interactive) on someone else's hold or a sold seat", () => {
    expect(actionsFor(seat("A1", "held"), "other")).toEqual([]);
    expect(actionsFor(seat("A1", "sold"), "none")).toEqual([]);
    expect(isInteractive(seat("A1", "held"), "other")).toBe(false);
    expect(isInteractive(seat("A1", "sold"), "none")).toBe(false);
  });
});

describe("pruneHolds", () => {
  it("keeps holds for seats still held, drops the rest", () => {
    const before = holds(["A1", "h1"], ["A2", "h2"], ["A3", "h3"]);
    const seats = [
      seat("A1", "held"), // kept
      seat("A2", "sold"), // confirmed → dropped
      seat("A3", "available"), // released/expired → dropped
    ];

    const after = pruneHolds(before, seats);

    expect([...after]).toEqual([["A1", "h1"]]);
  });
});

describe("holdGone", () => {
  it("treats 404 (HoldNotFound) and 410 (HoldExpired) as gone", () => {
    expect(holdGone(404)).toBe(true);
    expect(holdGone(410)).toBe(true);
  });

  it("leaves other failures (409 taken, 0 network, 500) as not-gone", () => {
    expect(holdGone(409)).toBe(false);
    expect(holdGone(0)).toBe(false);
    expect(holdGone(500)).toBe(false);
  });
});

describe("countByStatus", () => {
  it("tallies each status and the total", () => {
    expect(
      countByStatus([
        seat("A1", "available"),
        seat("A2", "held"),
        seat("A3", "sold"),
        seat("A4", "available"),
      ]),
    ).toEqual({ total: 4, available: 2, held: 1, sold: 1 });
  });
});

describe("toRows", () => {
  it("groups seats into venue rows ordered by number", () => {
    const rows = toRows([
      seat("B2", "available"),
      seat("A10", "available"),
      seat("A2", "held"),
      seat("B1", "sold"),
    ]);

    expect(rows.map((row) => row.label)).toEqual(["A", "B"]);
    expect(rows[0]?.seats.map((s) => s.seatId)).toEqual(["A2", "A10"]); // numeric, not lexicographic
    expect(rows[1]?.seats.map((s) => s.seatId)).toEqual(["B1", "B2"]);
  });

  it("puts non-venue ids into a single unlabeled row", () => {
    const rows = toRows([seat("x", "available"), seat("y", "available")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("");
  });
});
