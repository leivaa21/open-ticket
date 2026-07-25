import type {
  Command,
  ConfirmPurchase,
  DomainEventFact,
  EpochMillis,
  HoldId,
  ReleaseHold,
  ReserveSeats,
  ScheduleShow,
} from "@open-ticket/contracts";

import type { DomainError } from "./errors.ts";
import {
  holdExpired,
  holdNotFound,
  seatsUnavailable,
  showAlreadyScheduled,
  showNotFound,
  unknownSeat,
} from "./errors.ts";
import type { ScheduledShow, ShowState } from "./state.ts";
import { isLiveAt, occupiedSeats } from "./state.ts";

/**
 * The hold identity the application allocated for a `ReserveSeats` — its `holdId` (from the
 * `IdGenerator` port) and `expiresAt` (`Clock.now()` + TTL). It is an INPUT to `decide` so the
 * domain stays pure and deterministic: no `crypto`, no `Date` inside the aggregate (D1-03/D1-07).
 */
export interface HoldAllocation {
  readonly holdId: HoldId;
  readonly expiresAt: EpochMillis;
}

/**
 * The time/id seam that keeps `decide` pure (D1-03). PR3's use cases fill it from the `Clock` and
 * `IdGenerator` ports:
 *   - `now`     — every liveness check reads it (never `Date.now()`). Required for all commands.
 *   - `newHold` — consumed ONLY by `ReserveSeats` (the allocated hold to emit). Omit it for the
 *     other commands; supplying it there is harmless and ignored.
 */
export interface DecideContext {
  readonly now: EpochMillis;
  readonly newHold?: HoldAllocation;
}

/** `decide`'s outcome: the events to append, or a typed rejection — never both, never a throw. */
export type DecideResult =
  | { readonly ok: true; readonly events: readonly DomainEventFact[] }
  | { readonly ok: false; readonly error: DomainError };

/**
 * `decide(state, command, ctx) → events | DomainError` (D1-01). Pure and exhaustive over the four
 * commands. Emits bare `{ type, payload }` facts — the store assigns `streamId`/`revision` later,
 * so no revisions are invented here.
 */
export function decide(state: ShowState, command: Command, ctx: DecideContext): DecideResult {
  switch (command.type) {
    case "ScheduleShow":
      return decideScheduleShow(state, command);
    case "ReserveSeats":
      return decideReserveSeats(state, command, ctx);
    case "ConfirmPurchase":
      return decideConfirmPurchase(state, command, ctx.now);
    case "ReleaseHold":
      return decideReleaseHold(state, command, ctx.now);
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

function decideScheduleShow(state: ShowState, command: ScheduleShow): DecideResult {
  if (state.exists) return reject(showAlreadyScheduled);
  return emit({ type: "ShowScheduled", payload: { seatIds: command.seatIds } });
}

function decideReserveSeats(
  state: ShowState,
  command: ReserveSeats,
  ctx: DecideContext,
): DecideResult {
  if (!state.exists) return reject(showNotFound);

  const unknown = command.seatIds.filter((seat) => !state.seats.has(seat));
  if (unknown.length > 0) return reject(unknownSeat(unknown));

  const occupied = occupiedSeats(state, ctx.now);
  const unavailable = command.seatIds.filter(
    (seat) => state.soldSeats.has(seat) || occupied.has(seat),
  );
  if (unavailable.length > 0) return reject(seatsUnavailable(unavailable));

  const allocation = ctx.newHold;
  if (allocation === undefined) {
    // Wiring contract: a ReserveSeats must arrive with an allocated hold. A correctly wired use
    // case (PR3) always provides one, so this is a bug, not a business rejection.
    throw new Error("ReserveSeats requires ctx.newHold (the allocated hold id + expiry)");
  }
  // Preconditions on the trusted allocation seam — a correct IdGenerator/Clock (PR3) always
  // satisfies both, so a violation is a wiring bug, not a business rejection. Asserting them
  // makes holdId uniqueness and future expiry explicit domain invariants rather than assumptions:
  // a reused id would silently overwrite a live hold, and an already-expired hold would report
  // success yet be dead on arrival.
  if (state.holds.has(allocation.holdId)) {
    throw new Error(`ReserveSeats allocated a holdId already in use: ${allocation.holdId}`);
  }
  if (allocation.expiresAt <= ctx.now) {
    throw new Error("ReserveSeats allocated a hold that is already expired (expiresAt <= now)");
  }
  return emit({
    type: "SeatsHeld",
    payload: {
      holdId: allocation.holdId,
      seatIds: command.seatIds,
      holderId: command.holderId,
      expiresAt: allocation.expiresAt,
    },
  });
}

function decideConfirmPurchase(
  state: ShowState,
  command: ConfirmPurchase,
  now: EpochMillis,
): DecideResult {
  if (!state.exists) return reject(showNotFound);

  const hold = liveOrDead(state, command.holdId);
  if (hold === undefined) return reject(holdNotFound); // never held, or already released/sold
  if (hold.status === "expired" || hold.expiresAt <= now) return reject(holdExpired);

  return emit({ type: "SeatsSold", payload: { holdId: command.holdId, seatIds: hold.seatIds } });
}

function decideReleaseHold(state: ShowState, command: ReleaseHold, now: EpochMillis): DecideResult {
  if (!state.exists) return reject(showNotFound);

  const hold = state.holds.get(command.holdId);
  // Release only acts on an effectively-live hold; a missing, released, sold, or time-expired hold
  // has nothing live to release.
  if (hold === undefined || !isLiveAt(hold, now)) return reject(holdNotFound);

  return emit({ type: "HoldReleased", payload: { holdId: command.holdId } });
}

/** A hold that still exists as more than released/sold — i.e. `live` or recorded `expired`. */
function liveOrDead(state: ScheduledShow, holdId: HoldId) {
  const hold = state.holds.get(holdId);
  if (hold === undefined || hold.status === "released" || hold.status === "sold") return undefined;
  return hold;
}

function emit(...events: DomainEventFact[]): DecideResult {
  return { ok: true, events };
}

function reject(error: DomainError): DecideResult {
  return { ok: false, error };
}
