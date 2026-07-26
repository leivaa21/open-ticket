import type { EpochMillis, HolderId, HoldId, SeatId, SeatIdList } from "@open-ticket/contracts";

/**
 * The Show aggregate's in-memory state — a pure fold over its event stream (D1-01). It exists to
 * let `decide` answer one question correctly: "is this seat available right now?" — never sold,
 * and not inside a *live* hold.
 *
 * Time is deliberately absent here: `evolve` records a hold's `status` and `expiresAt` but never
 * judges whether it is expired (D1-03, lazy expiry). Only `decide`, given the current time, treats
 * a `status: "live"` hold whose `expiresAt` has passed as dead. So a hold's *recorded* status is
 * one thing; its *effective* liveness (recorded-live AND not yet past `expiresAt`) is a `decide`
 * concern.
 */

/** Recorded lifecycle of a hold. `expired` only appears if a stream carries `HoldExpired` (no M1 emitter — D1-03). */
export type HoldStatus = "live" | "released" | "sold" | "expired";

export interface Hold {
  readonly seatIds: SeatIdList;
  readonly holderId: HolderId;
  readonly expiresAt: EpochMillis;
  readonly status: HoldStatus;
}

/** A show that has been scheduled: its inventory, every hold ever placed, and the sold seats. */
export interface ScheduledShow {
  readonly exists: true;
  readonly seats: ReadonlySet<SeatId>;
  readonly holds: ReadonlyMap<HoldId, Hold>;
  readonly soldSeats: ReadonlySet<SeatId>;
}

/** Either the show does not exist yet, or it has been scheduled. */
export type ShowState = { readonly exists: false } | ScheduledShow;

/** The starting point for reconstitution: the show does not exist until `ShowScheduled` folds in. */
export const initialState: ShowState = { exists: false };

/**
 * Seats occupied by a hold that is *effectively live* at `now` — recorded `live` and not past its
 * `expiresAt`. A time-expired hold contributes nothing, which is exactly what frees its seats for
 * a later reservation (lazy expiry).
 */
export function occupiedSeats(state: ScheduledShow, now: EpochMillis): ReadonlySet<SeatId> {
  const occupied = new Set<SeatId>();
  for (const hold of state.holds.values()) {
    if (isLiveAt(hold, now)) {
      for (const seat of hold.seatIds) occupied.add(seat);
    }
  }
  return occupied;
}

/** Effective liveness: the hold is recorded `live` and its expiry is still in the future at `now`. */
export function isLiveAt(hold: Hold, now: EpochMillis): boolean {
  return hold.status === "live" && hold.expiresAt > now;
}
