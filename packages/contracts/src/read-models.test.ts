import { describe, expect, it } from "vitest";

import { DevAppended, DevLag } from "./read-models.ts";

describe("DevAppended", () => {
  it("parses a well-formed appended frame", () => {
    const result = DevAppended.safeParse({ position: 3, type: "SeatsHeld", showId: "show-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a negative position or a non-string type", () => {
    expect(DevAppended.safeParse({ position: -1, type: "X", showId: "s" }).success).toBe(false);
    expect(DevAppended.safeParse({ position: 0, type: 5, showId: "s" }).success).toBe(false);
  });
});

describe("DevLag", () => {
  it("parses a caught-up snapshot and one that is behind", () => {
    expect(DevLag.safeParse({ head: 0, asOf: -1, behind: 0 }).success).toBe(true);
    expect(DevLag.safeParse({ head: 5, asOf: 1, behind: 3 }).success).toBe(true);
  });

  it("rejects a negative head or behind", () => {
    expect(DevLag.safeParse({ head: -1, asOf: 0, behind: 0 }).success).toBe(false);
    expect(DevLag.safeParse({ head: 2, asOf: 0, behind: -1 }).success).toBe(false);
  });
});
