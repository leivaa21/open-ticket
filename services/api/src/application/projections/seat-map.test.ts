import type { DomainEventFact } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import { held, expired, released, scheduled, sold } from "./fixtures.ts";
import { applySeatMap, emptySeatMap } from "./seat-map.ts";
import type { SeatMapState } from "./seat-map.ts";

/** Fold a whole event sequence from the empty map — the projector's per-show reduction. */
function fold(events: readonly DomainEventFact[]): SeatMapState {
  return events.reduce(applySeatMap, emptySeatMap);
}

/** The raw status of a seat, as a plain object for assertions. */
function statusOf(state: SeatMapState, seatId: string) {
  return state.seats.get(seatId as never);
}

describe("applySeatMap — the pure SeatMap reducer (D2-01)", () => {
  it("ShowScheduled seeds every seat available, in inventory order", () => {
    const state = fold([scheduled("A1", "A2", "B1")]);

    expect([...state.seats.keys()]).toEqual(["A1", "A2", "B1"]);
    expect([...state.seats.values()].every((status) => status.kind === "available")).toBe(true);
  });

  it("SeatsHeld marks the held seats with the hold's expiry, leaving others available", () => {
    const state = fold([scheduled("A1", "A2"), held("h1", "alice", 600, "A1")]);

    expect(statusOf(state, "A1")).toEqual({
      kind: "held",
      holdId: "h1",
      holderId: "alice",
      expiresAt: 600,
    });
    expect(statusOf(state, "A2")).toEqual({ kind: "available" });
  });

  it("HoldReleased frees exactly that hold's seats", () => {
    const state = fold([scheduled("A1", "A2"), held("h1", "alice", 600, "A1"), released("h1")]);

    expect(statusOf(state, "A1")).toEqual({ kind: "available" });
  });

  it("HoldExpired frees that hold's seats (a sweeper event, D2-04)", () => {
    const state = fold([scheduled("A1"), held("h1", "alice", 600, "A1"), expired("h1")]);

    expect(statusOf(state, "A1")).toEqual({ kind: "available" });
  });

  it("SeatsSold marks seats sold (terminal)", () => {
    const state = fold([scheduled("A1"), held("h1", "alice", 600, "A1"), sold("h1", "A1")]);

    expect(statusOf(state, "A1")).toEqual({ kind: "sold" });
  });

  it("a second hold after a release re-holds the freed seat under the new hold", () => {
    const state = fold([
      scheduled("A1"),
      held("h1", "alice", 600, "A1"),
      released("h1"),
      held("h2", "bob", 900, "A1"),
    ]);

    expect(statusOf(state, "A1")).toEqual({
      kind: "held",
      holdId: "h2",
      holderId: "bob",
      expiresAt: 900,
    });
  });

  it("only touches seats in inventory (a stray seat id is ignored, not added)", () => {
    const state = fold([scheduled("A1"), held("h1", "alice", 600, "A1", "GHOST")]);

    expect(state.seats.has("GHOST" as never)).toBe(false);
    expect([...state.seats.keys()]).toEqual(["A1"]);
  });

  it("does not mutate the previous state (immutable fold)", () => {
    const first = fold([scheduled("A1")]);
    const second = applySeatMap(first, held("h1", "alice", 600, "A1"));

    expect(statusOf(first, "A1")).toEqual({ kind: "available" }); // unchanged
    expect(second).not.toBe(first);
  });
});
