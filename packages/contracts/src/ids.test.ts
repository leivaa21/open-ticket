import { describe, expect, expectTypeOf, it } from "vitest";

import { SeatId, SeatIdList } from "./ids.ts";

describe("SeatIdList", () => {
  it("accepts a non-empty, duplicate-free list", () => {
    const result = SeatIdList.safeParse(["A1", "A2", "B1"]);

    expect(result.success).toBe(true);
  });

  it("accepts a single seat", () => {
    expect(SeatIdList.safeParse(["A1"]).success).toBe(true);
  });

  it("rejects an empty list — every seat operation acts on at least one seat", () => {
    expect(SeatIdList.safeParse([]).success).toBe(false);
  });

  it("rejects duplicates rather than silently collapsing them", () => {
    const result = SeatIdList.safeParse(["A1", "A1"]);

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.message).toContain("duplicates");
  });

  it("carries the non-empty guarantee into the TYPE: the head is a SeatId, never undefined", () => {
    const seatIds = SeatIdList.parse(["A1", "A2"]);

    // Under noUncheckedIndexedAccess this only holds because SeatIdList is a [SeatId, ...SeatId[]]
    // tuple — a plain SeatId[] would make head `SeatId | undefined` and fail to compile.
    expectTypeOf(seatIds[0]).toEqualTypeOf<SeatId>();
  });
});
