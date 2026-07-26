import type { SeatId } from "@open-ticket/contracts";

/**
 * Typed domain errors (D1-06). `decide` *returns* these — it never throws for an expected
 * business rejection — so callers handle them exhaustively (discriminated by `type`). A thrown
 * exception in the domain means a genuine bug (e.g. a corrupt event stream), not a rule.
 */
export type DomainError =
  | { readonly type: "ShowNotFound" }
  | { readonly type: "ShowAlreadyScheduled" }
  | { readonly type: "UnknownSeat"; readonly seatIds: readonly SeatId[] }
  | { readonly type: "SeatsUnavailable"; readonly seatIds: readonly SeatId[] }
  | { readonly type: "HoldNotFound" }
  | { readonly type: "HoldExpired" };

export type DomainErrorType = DomainError["type"];

// Constructors — the payload-free errors are shared immutable singletons; the seat-naming ones
// carry exactly the offending seats so the interface layer can report them (PR4).
export const showNotFound: DomainError = { type: "ShowNotFound" };
export const showAlreadyScheduled: DomainError = { type: "ShowAlreadyScheduled" };
export const holdNotFound: DomainError = { type: "HoldNotFound" };
export const holdExpired: DomainError = { type: "HoldExpired" };

export const unknownSeat = (seatIds: readonly SeatId[]): DomainError => ({
  type: "UnknownSeat",
  seatIds,
});

export const seatsUnavailable = (seatIds: readonly SeatId[]): DomainError => ({
  type: "SeatsUnavailable",
  seatIds,
});
