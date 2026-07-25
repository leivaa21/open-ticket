import type {
  DomainEventFact,
  HoldId,
  SeatsHeld,
  SeatsSold,
  SeatIdList,
} from "@open-ticket/contracts";

import type { Hold, HoldStatus, ScheduledShow, ShowState } from "./state.ts";
import { initialState } from "./state.ts";

/**
 * `evolve(state, event) → state` (D1-01): applies one event fact to the aggregate state. Pure,
 * total, exhaustive over the five event types. Time-independent — it records what happened, never
 * judges expiry (that's `decide`'s job with the clock; D1-03). `HoldExpired` is folded here even
 * though no M1 command emits it: a stream may already carry one (a later sweeper — D1-03), and
 * replay must handle it.
 *
 * A thrown error signals a *corrupt* stream (an event that our own `decide` could never have
 * produced, e.g. a hold event before the show was scheduled) — a genuine bug, not a rule.
 */
export function evolve(state: ShowState, event: DomainEventFact): ShowState {
  switch (event.type) {
    case "ShowScheduled":
      return schedule(state, event.payload.seatIds);
    case "SeatsHeld":
      return addHold(requireShow(state), event.payload);
    case "HoldReleased":
      return setHoldStatus(requireShow(state), event.payload.holdId, "released");
    case "HoldExpired":
      return setHoldStatus(requireShow(state), event.payload.holdId, "expired");
    case "SeatsSold":
      return sell(requireShow(state), event.payload);
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Reconstitute aggregate state by folding a show's event stream from the initial state. */
export function reconstitute(events: Iterable<DomainEventFact>): ShowState {
  let state = initialState;
  for (const event of events) state = evolve(state, event);
  return state;
}

function requireShow(state: ShowState): ScheduledShow {
  if (!state.exists) {
    throw new Error("event applied to a show that was never scheduled (corrupt stream)");
  }
  return state;
}

function schedule(state: ShowState, seatIds: SeatIdList): ScheduledShow {
  if (state.exists) {
    throw new Error("ShowScheduled applied to an already-scheduled show (corrupt stream)");
  }
  return { exists: true, seats: new Set(seatIds), holds: new Map(), soldSeats: new Set() };
}

function addHold(state: ScheduledShow, payload: SeatsHeld["payload"]): ScheduledShow {
  const holds = new Map(state.holds);
  holds.set(payload.holdId, {
    seatIds: payload.seatIds,
    holderId: payload.holderId,
    expiresAt: payload.expiresAt,
    status: "live",
  });
  return { ...state, holds };
}

function setHoldStatus(state: ScheduledShow, holdId: HoldId, status: HoldStatus): ScheduledShow {
  const holds = new Map(state.holds);
  holds.set(holdId, { ...requireHold(state, holdId), status });
  return { ...state, holds };
}

function sell(state: ScheduledShow, payload: SeatsSold["payload"]): ScheduledShow {
  const holds = new Map(state.holds);
  holds.set(payload.holdId, { ...requireHold(state, payload.holdId), status: "sold" });
  const soldSeats = new Set(state.soldSeats);
  for (const seat of payload.seatIds) soldSeats.add(seat);
  return { ...state, holds, soldSeats };
}

function requireHold(state: ScheduledShow, holdId: HoldId): Hold {
  const hold = state.holds.get(holdId);
  if (hold === undefined) {
    throw new Error(`event references hold ${holdId}, which was never held (corrupt stream)`);
  }
  return hold;
}
