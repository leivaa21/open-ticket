import type { DomainEventFact } from "@open-ticket/contracts";

import { holder, holdId, seats } from "../test-support.ts";

/**
 * Test-only event-fact builders for projection tests (branded ids via the app test-support). Not a
 * `.test.ts`, so Vitest never runs it; not reachable from `main.ts`, so it never ships.
 */

export const scheduled = (...seatNames: string[]): DomainEventFact => ({
  type: "ShowScheduled",
  payload: { seatIds: seats(...seatNames) },
});

export const held = (
  hold: string,
  who: string,
  expiresAt: number,
  ...seatNames: string[]
): DomainEventFact => ({
  type: "SeatsHeld",
  payload: { holdId: holdId(hold), seatIds: seats(...seatNames), holderId: holder(who), expiresAt },
});

export const released = (hold: string): DomainEventFact => ({
  type: "HoldReleased",
  payload: { holdId: holdId(hold) },
});

export const expired = (hold: string): DomainEventFact => ({
  type: "HoldExpired",
  payload: { holdId: holdId(hold) },
});

export const sold = (hold: string, ...seatNames: string[]): DomainEventFact => ({
  type: "SeatsSold",
  payload: { holdId: holdId(hold), seatIds: seats(...seatNames) },
});
