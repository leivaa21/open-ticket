import type {
  DomainEventFact,
  EpochMillis,
  HolderId,
  HoldId,
  SeatId,
} from "@open-ticket/contracts";

/**
 * The SeatMap read model for one show (D2-01) — a pure, immutable fold of that show's events into
 * each seat's RAW projected state. "Raw" is deliberate: a held seat records its `expiresAt` but the
 * reducer never compares it to a clock (D2-04, lazy expiry). Effective status is resolved at query
 * time (see `queries.ts`). Being a pure fold makes the projection rebuildable from position 0 (D2-06).
 */
export type RawSeatStatus =
  | { readonly kind: "available" }
  | {
      readonly kind: "held";
      readonly holdId: HoldId;
      readonly holderId: HolderId;
      readonly expiresAt: EpochMillis;
    }
  | { readonly kind: "sold" };

export interface SeatMapState {
  /** Seat → raw status, in inventory (declaration) order. */
  readonly seats: ReadonlyMap<SeatId, RawSeatStatus>;
}

const AVAILABLE: RawSeatStatus = { kind: "available" };
const SOLD: RawSeatStatus = { kind: "sold" };

/** A show not yet seen by the projector — the fold's starting point (before `ShowScheduled`). */
export const emptySeatMap: SeatMapState = { seats: new Map() };

/**
 * Applies one event to a show's SeatMap. Pure, exhaustive over the 5 event types (D2-01).
 *
 * Unlike the domain's `evolve` (which throws on a corrupt stream), a projection is deliberately
 * tolerant: a stray or out-of-order event no-ops via the inventory guard rather than crashing the
 * read side. Corrupt streams are unreachable from the domain, so this only ever costs a no-op.
 */
export function applySeatMap(state: SeatMapState, event: DomainEventFact): SeatMapState {
  switch (event.type) {
    case "ShowScheduled":
      return scheduleInventory(event.payload.seatIds);
    case "SeatsHeld":
      return setSeats(state, event.payload.seatIds, {
        kind: "held",
        holdId: event.payload.holdId,
        holderId: event.payload.holderId,
        expiresAt: event.payload.expiresAt,
      });
    case "SeatsSold":
      return setSeats(state, event.payload.seatIds, SOLD); // terminal
    case "HoldReleased":
      return freeHold(state, event.payload.holdId);
    case "HoldExpired":
      return freeHold(state, event.payload.holdId);
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** `ShowScheduled` seeds the full inventory, every seat available. */
function scheduleInventory(seatIds: readonly SeatId[]): SeatMapState {
  const seats = new Map<SeatId, RawSeatStatus>();
  for (const seatId of seatIds) seats.set(seatId, AVAILABLE);
  return { seats };
}

/** Sets the given seats to a status; only touches seats already in inventory (defensive). */
function setSeats(
  state: SeatMapState,
  seatIds: readonly SeatId[],
  status: RawSeatStatus,
): SeatMapState {
  const seats = new Map(state.seats);
  for (const seatId of seatIds) {
    if (seats.has(seatId)) seats.set(seatId, status);
  }
  return { seats };
}

/** Frees every seat still held by `holdId` (release or lazy-sweeper expiry) back to available. */
function freeHold(state: SeatMapState, holdId: HoldId): SeatMapState {
  const seats = new Map(state.seats);
  for (const [seatId, status] of seats) {
    if (status.kind === "held" && status.holdId === holdId) seats.set(seatId, AVAILABLE);
  }
  return { seats };
}
