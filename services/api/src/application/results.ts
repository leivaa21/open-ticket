import type { DomainError } from "../domain/index.ts";

/**
 * A retry-exhausted optimistic-concurrency conflict (D1-05). It is *surfaced* in the result union,
 * never thrown — the interface layer (PR4) maps it to a status the same way it maps domain errors.
 */
export interface Conflict {
  readonly type: "Conflict";
}
export const conflict: Conflict = { type: "Conflict" };

/** Why a use case did not succeed: a domain rule rejection, or a concurrency conflict. */
export type Rejection = DomainError | Conflict;

/** Every use case returns this — success with a value, or a typed rejection. No thrown business errors. */
export type UseCaseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Rejection };

export const succeed = <T>(value: T): UseCaseResult<T> => ({ ok: true, value });
export const rejectWith = <T>(error: Rejection): UseCaseResult<T> => ({ ok: false, error });
