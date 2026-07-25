import { describe, expect, it } from "vitest";

import {
  DomainEventSchema,
  HoldExpired,
  HoldReleased,
  SeatsHeld,
  SeatsSold,
  ShowScheduled,
} from "./events.ts";
import type { DomainEventFact } from "./events.ts";

describe("event schemas", () => {
  it("parses ShowScheduled (seat inventory, no showId in the payload — that's the stream)", () => {
    const result = ShowScheduled.safeParse({
      type: "ShowScheduled",
      payload: { seatIds: ["A1", "A2"] },
    });

    expect(result.success).toBe(true);
  });

  it("parses SeatsHeld with an epoch-millis expiry", () => {
    const result = SeatsHeld.safeParse({
      type: "SeatsHeld",
      payload: {
        holdId: "hold-1",
        seatIds: ["A1", "A2"],
        holderId: "holder-9",
        expiresAt: 1_700_000_000_000,
      },
    });

    expect(result.success).toBe(true);
  });

  it("parses HoldReleased, HoldExpired and SeatsSold", () => {
    expect(
      HoldReleased.safeParse({ type: "HoldReleased", payload: { holdId: "h1" } }).success,
    ).toBe(true);
    expect(HoldExpired.safeParse({ type: "HoldExpired", payload: { holdId: "h1" } }).success).toBe(
      true,
    );
    expect(
      SeatsSold.safeParse({ type: "SeatsSold", payload: { holdId: "h1", seatIds: ["A1"] } })
        .success,
    ).toBe(true);
  });

  it("rejects a non-integer or negative expiry (timestamps are epoch millis, not Date)", () => {
    const base = { holdId: "h1", seatIds: ["A1"], holderId: "hp" };
    expect(
      SeatsHeld.safeParse({ type: "SeatsHeld", payload: { ...base, expiresAt: 1.5 } }).success,
    ).toBe(false);
    expect(
      SeatsHeld.safeParse({ type: "SeatsHeld", payload: { ...base, expiresAt: -1 } }).success,
    ).toBe(false);
    expect(
      SeatsHeld.safeParse({
        type: "SeatsHeld",
        payload: { ...base, expiresAt: new Date() },
      }).success,
    ).toBe(false);
  });

  it("rejects empty and duplicated seatIds in an event payload", () => {
    expect(
      ShowScheduled.safeParse({ type: "ShowScheduled", payload: { seatIds: [] } }).success,
    ).toBe(false);
    expect(
      SeatsSold.safeParse({ type: "SeatsSold", payload: { holdId: "h1", seatIds: ["A1", "A1"] } })
        .success,
    ).toBe(false);
  });
});

describe("DomainEvent discriminated union", () => {
  const valid: readonly unknown[] = [
    { type: "ShowScheduled", payload: { seatIds: ["A1"] } },
    { type: "SeatsHeld", payload: { holdId: "h1", seatIds: ["A1"], holderId: "hp", expiresAt: 1 } },
    { type: "HoldReleased", payload: { holdId: "h1" } },
    { type: "HoldExpired", payload: { holdId: "h1" } },
    { type: "SeatsSold", payload: { holdId: "h1", seatIds: ["A1"] } },
  ];

  it("accepts every event member", () => {
    for (const event of valid) {
      expect(DomainEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("rejects an unknown discriminant", () => {
    expect(DomainEventSchema.safeParse({ type: "SeatMelted", payload: {} }).success).toBe(false);
  });

  it("folds exhaustively — the aggregate can switch over every fact", () => {
    // Compiles only while `DomainEventFact` is exactly these five (the `never` default proves it).
    const seatCount = (event: DomainEventFact): number => {
      switch (event.type) {
        case "ShowScheduled":
          return event.payload.seatIds.length;
        case "SeatsHeld":
          return event.payload.seatIds.length;
        case "SeatsSold":
          return event.payload.seatIds.length;
        case "HoldReleased":
        case "HoldExpired":
          return 0;
        default: {
          const exhaustive: never = event;
          return exhaustive;
        }
      }
    };

    expect(seatCount(DomainEventSchema.parse(valid[0]))).toBe(1);
    expect(seatCount(DomainEventSchema.parse(valid[2]))).toBe(0);
  });
});
