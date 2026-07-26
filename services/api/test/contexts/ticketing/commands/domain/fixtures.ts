import type {
  Command,
  ConfirmPurchase,
  DomainEventFact,
  EpochMillis,
  HolderId,
  HoldId,
  ReleaseHold,
  ReserveSeats,
  ScheduleShow,
  SeatId,
  SeatIdList,
  ShowId,
} from "@open-ticket/contracts";

import { decide } from "@api/contexts/ticketing/commands/domain/decide.ts";
import type {
  DecideContext,
  DecideResult,
} from "@api/contexts/ticketing/commands/domain/decide.ts";
import { evolve } from "@api/contexts/ticketing/commands/domain/evolve.ts";
import { initialState } from "@api/contexts/ticketing/commands/domain/state.ts";
import type { ShowState } from "@api/contexts/ticketing/commands/domain/state.ts";

/**
 * Test-only builders. The domain trusts typed input (validation ran at the edge in PR1), so tests
 * mint branded ids directly instead of round-tripping through zod. Not a `.test.ts`, so Vitest
 * never runs it; not reachable from `main.ts`, so tsup never bundles it.
 */

export const showId = (id: string): ShowId => id as ShowId;
export const seat = (id: string): SeatId => id as SeatId;
export const holder = (id: string): HolderId => id as HolderId;
export const hold = (id: string): HoldId => id as HoldId;
export const seats = (...ids: string[]): SeatIdList => ids.map(seat) as SeatIdList;
export const at = (ms: number): EpochMillis => ms;

export const scheduleShow = (show: string, ...seatNames: string[]): ScheduleShow => ({
  type: "ScheduleShow",
  showId: showId(show),
  seatIds: seats(...seatNames),
});

export const reserveSeats = (
  show: string,
  holderName: string,
  ...seatNames: string[]
): ReserveSeats => ({
  type: "ReserveSeats",
  showId: showId(show),
  seatIds: seats(...seatNames),
  holderId: holder(holderName),
});

export const confirmPurchase = (show: string, holdName: string): ConfirmPurchase => ({
  type: "ConfirmPurchase",
  showId: showId(show),
  holdId: hold(holdName),
});

export const releaseHold = (show: string, holdName: string): ReleaseHold => ({
  type: "ReleaseHold",
  showId: showId(show),
  holdId: hold(holdName),
});

// Event-fact builders (branded), for hand-writing streams in evolve/reconstitute tests.
export const showScheduledEvent = (...seatNames: string[]): DomainEventFact => ({
  type: "ShowScheduled",
  payload: { seatIds: seats(...seatNames) },
});

export const seatsHeldEvent = (
  holdName: string,
  holderName: string,
  expiresAt: number,
  ...seatNames: string[]
): DomainEventFact => ({
  type: "SeatsHeld",
  payload: {
    holdId: hold(holdName),
    seatIds: seats(...seatNames),
    holderId: holder(holderName),
    expiresAt: at(expiresAt),
  },
});

export const seatsSoldEvent = (holdName: string, ...seatNames: string[]): DomainEventFact => ({
  type: "SeatsSold",
  payload: { holdId: hold(holdName), seatIds: seats(...seatNames) },
});

export const holdReleasedEvent = (holdName: string): DomainEventFact => ({
  type: "HoldReleased",
  payload: { holdId: hold(holdName) },
});

export const holdExpiredEvent = (holdName: string): DomainEventFact => ({
  type: "HoldExpired",
  payload: { holdId: hold(holdName) },
});

/** A decide context at `now`, optionally carrying the hold allocation a ReserveSeats needs. */
export const ctxAt = (
  now: number,
  newHold?: { holdId: string; expiresAt: number },
): DecideContext =>
  newHold === undefined
    ? { now: at(now) }
    : { now: at(now), newHold: { holdId: hold(newHold.holdId), expiresAt: at(newHold.expiresAt) } };

export interface Step {
  readonly state: ShowState;
  readonly result: DecideResult;
}

/** Decide one command and fold any emitted events back into state — mirrors PR3's use-case loop. */
export function run(state: ShowState, command: Command, ctx: DecideContext): Step {
  const result = decide(state, command, ctx);
  const next = result.ok ? result.events.reduce((s, event) => evolve(s, event), state) : state;
  return { state: next, result };
}

export interface Act {
  readonly command: Command;
  readonly ctx: DecideContext;
}

/** Play a sequence of (command, ctx) acts from the initial state, collecting the event stream. */
export function play(acts: readonly Act[]): {
  readonly state: ShowState;
  readonly stream: readonly DomainEventFact[];
} {
  let state: ShowState = initialState;
  const stream: DomainEventFact[] = [];
  for (const { command, ctx } of acts) {
    const result = decide(state, command, ctx);
    if (result.ok) {
      stream.push(...result.events);
      state = result.events.reduce((s, event) => evolve(s, event), state);
    }
  }
  return { state, stream };
}
