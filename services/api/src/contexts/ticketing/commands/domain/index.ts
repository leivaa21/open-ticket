/**
 * The Show aggregate — the pure heart of the write side (D1-01). One show = one consistency
 * boundary = one event stream. `decide(state, command, ctx)` returns the events to append or a
 * typed `DomainError`; `evolve(state, event)` folds one event into state; `reconstitute` replays
 * a stream. Everything here is pure and time-free except for the clock/id values injected through
 * `DecideContext` (D1-03) — no framework, no I/O, no zod runtime, no `Date`/`crypto`.
 */

export { decide } from "./decide.ts";
export type { DecideContext, DecideResult, HoldAllocation } from "./decide.ts";
export { evolve, reconstitute } from "./evolve.ts";
export { initialState, isLiveAt, occupiedSeats } from "./state.ts";
export type { Hold, HoldStatus, ScheduledShow, ShowState } from "./state.ts";
export type { DomainError, DomainErrorType } from "./errors.ts";
export {
  holdExpired,
  holdNotFound,
  seatsUnavailable,
  showAlreadyScheduled,
  showNotFound,
  unknownSeat,
} from "./errors.ts";
