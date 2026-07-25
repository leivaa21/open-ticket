import { z } from "zod";

/**
 * Identifier and primitive value schemas shared by commands and events.
 *
 * Ids are **branded strings** (D1-02, lightweight): the wire/runtime value is a plain non-empty
 * string, but the inferred TS type is distinct per id kind — so a `HolderId` can't be passed
 * where a `HoldId` is expected (both are strings, trivially swappable otherwise). Branding is a
 * zero-runtime, zod-native `.brand()` and keeps this domain's four id kinds correct by
 * construction. Values entering through `.parse()` are branded automatically — no manual casts.
 */

export const ShowId = z.string().min(1).brand("ShowId");
export type ShowId = z.infer<typeof ShowId>;

export const SeatId = z.string().min(1).brand("SeatId");
export type SeatId = z.infer<typeof SeatId>;

export const HolderId = z.string().min(1).brand("HolderId");
export type HolderId = z.infer<typeof HolderId>;

export const HoldId = z.string().min(1).brand("HoldId");
export type HoldId = z.infer<typeof HoldId>;

/**
 * A non-empty, duplicate-free list of seats. Non-empty because every seat operation acts on at
 * least one seat; de-duplicated because a command holding "A1, A1" is a client bug, not a
 * request to hold one seat — reject it at the edge rather than silently collapse it.
 *
 * Modeled as a tuple (`[SeatId, ...SeatId[]]`) rather than `.array().nonempty()`: in zod 4.x the
 * latter enforces min-1 only at runtime and still infers `SeatId[]`, so under this repo's
 * `noUncheckedIndexedAccess` the domain would see `seatIds[0]: SeatId | undefined` for a list
 * that can never be empty. The tuple form carries the non-empty guarantee into the type, so the
 * aggregate that folds these events can index the head without a phantom `undefined`.
 */
export const SeatIdList = z
  .tuple([SeatId])
  .rest(SeatId)
  .refine((seatIds) => new Set(seatIds).size === seatIds.length, {
    message: "seatIds must not contain duplicates",
  });
export type SeatIdList = z.infer<typeof SeatIdList>;

/**
 * A timestamp on the wire and in the event log: epoch milliseconds, an integer. Kept primitive
 * and serializable (never a `Date`) — the domain reads time from an injected `Clock` (D1-03),
 * so persisted events stay JSON-clean and replay identically.
 */
export const EpochMillis = z.number().int().nonnegative();
export type EpochMillis = z.infer<typeof EpochMillis>;
