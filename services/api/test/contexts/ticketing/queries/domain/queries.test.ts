import { describe, expect, it } from "vitest";

import { held, scheduled, sold } from "./fixtures.ts";
import { applySeatMap, emptySeatMap } from "@api/contexts/ticketing/queries/domain/seat-map.ts";
import {
  availabilityAsOf,
  effectiveStatus,
  seatMapAsOf,
} from "@api/contexts/ticketing/queries/domain/queries.ts";

// A show A1(held by h1, expires 600), A2(available), B1(sold).
const state = [
  scheduled("A1", "A2", "B1"),
  held("h1", "alice", 600, "A1"),
  sold("h2", "B1"),
].reduce(applySeatMap, emptySeatMap);

const statusAt = (now: number) =>
  Object.fromEntries(seatMapAsOf(state, now).map((seat) => [seat.seatId, seat.status]));

describe("time-aware queries — lazy expiry (D2-04)", () => {
  it("a held seat reads held before its expiry", () => {
    expect(statusAt(599).A1).toBe("held");
  });

  it("the boundary now === expiresAt reads available (hold is live iff expiresAt > now)", () => {
    expect(statusAt(600).A1).toBe("available");
  });

  it("a held seat reads available after its expiry (lazily freed)", () => {
    expect(statusAt(601).A1).toBe("available");
  });

  it("sold ignores the clock (terminal)", () => {
    expect(statusAt(1).B1).toBe("sold");
    expect(statusAt(10_000).B1).toBe("sold");
  });

  it("an untouched seat is always available", () => {
    expect(statusAt(1).A2).toBe("available");
    expect(statusAt(10_000).A2).toBe("available");
  });
});

describe("effectiveStatus boundary", () => {
  const heldRaw = {
    kind: "held",
    holdId: "h" as never,
    holderId: "x" as never,
    expiresAt: 600,
  } as const;

  it("held one ms before, dead at and after the expiry", () => {
    expect(effectiveStatus(heldRaw, 599)).toBe("held");
    expect(effectiveStatus(heldRaw, 600)).toBe("available");
    expect(effectiveStatus(heldRaw, 601)).toBe("available");
  });
});

describe("availabilityAsOf — counts reflect lazy expiry", () => {
  it("counts the held seat as held before expiry", () => {
    expect(availabilityAsOf(state, 599)).toEqual({ total: 3, available: 1, held: 1, sold: 1 });
  });

  it("counts it as available once expired — sold stays sold", () => {
    expect(availabilityAsOf(state, 600)).toEqual({ total: 3, available: 2, held: 0, sold: 1 });
  });
});
