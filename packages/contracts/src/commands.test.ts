import { describe, expect, it } from "vitest";

import {
  CommandSchema,
  ConfirmPurchase,
  ReleaseHold,
  ReserveSeats,
  ScheduleShow,
} from "./commands.ts";
import type { Command } from "./commands.ts";

describe("command schemas", () => {
  it("parses a valid ScheduleShow with its full seat inventory", () => {
    const result = ScheduleShow.safeParse({
      type: "ScheduleShow",
      showId: "show-1",
      seatIds: ["A1", "A2", "B1"],
    });

    expect(result.success).toBe(true);
  });

  it("parses a valid ReserveSeats (atomic multi-seat hold for a holder)", () => {
    const result = ReserveSeats.safeParse({
      type: "ReserveSeats",
      showId: "show-1",
      seatIds: ["A1", "A2"],
      holderId: "holder-9",
    });

    expect(result.success).toBe(true);
  });

  it("parses ConfirmPurchase and ReleaseHold (a hold addressed by holdId)", () => {
    expect(
      ConfirmPurchase.safeParse({ type: "ConfirmPurchase", showId: "show-1", holdId: "hold-1" })
        .success,
    ).toBe(true);
    expect(
      ReleaseHold.safeParse({ type: "ReleaseHold", showId: "show-1", holdId: "hold-1" }).success,
    ).toBe(true);
  });

  it("rejects an empty seatIds list", () => {
    const result = ReserveSeats.safeParse({
      type: "ReserveSeats",
      showId: "show-1",
      seatIds: [],
      holderId: "holder-9",
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate seats within one command (client bug, not one seat)", () => {
    const result = ScheduleShow.safeParse({
      type: "ScheduleShow",
      showId: "show-1",
      seatIds: ["A1", "A1"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("duplicate");
    }
  });

  it("rejects an empty-string id and a missing required field", () => {
    expect(
      ScheduleShow.safeParse({ type: "ScheduleShow", showId: "", seatIds: ["A1"] }).success,
    ).toBe(false);
    expect(
      ReserveSeats.safeParse({ type: "ReserveSeats", showId: "show-1", seatIds: ["A1"] }).success,
    ).toBe(false); // holderId missing
  });

  it("rejects a wrong field type", () => {
    const result = ScheduleShow.safeParse({
      type: "ScheduleShow",
      showId: "show-1",
      seatIds: "A1", // not an array
    });

    expect(result.success).toBe(false);
  });
});

describe("Command discriminated union", () => {
  const valid: readonly unknown[] = [
    { type: "ScheduleShow", showId: "show-1", seatIds: ["A1"] },
    { type: "ReserveSeats", showId: "show-1", seatIds: ["A1"], holderId: "h1" },
    { type: "ConfirmPurchase", showId: "show-1", holdId: "hold-1" },
    { type: "ReleaseHold", showId: "show-1", holdId: "hold-1" },
  ];

  it("accepts every command member", () => {
    for (const command of valid) {
      expect(CommandSchema.safeParse(command).success).toBe(true);
    }
  });

  it("rejects an unknown discriminant", () => {
    expect(CommandSchema.safeParse({ type: "CancelEverything", showId: "show-1" }).success).toBe(
      false,
    );
  });

  it("routes the union to the right member — the domain can switch exhaustively", () => {
    // Compiles only while `Command` is exactly these four; the `never` default proves it.
    const label = (command: Command): string => {
      switch (command.type) {
        case "ScheduleShow":
          return "schedule";
        case "ReserveSeats":
          return "reserve";
        case "ConfirmPurchase":
          return "confirm";
        case "ReleaseHold":
          return "release";
        default: {
          const exhaustive: never = command;
          return exhaustive;
        }
      }
    };

    const parsed = CommandSchema.parse(valid[1]);
    expect(label(parsed)).toBe("reserve");
  });
});
