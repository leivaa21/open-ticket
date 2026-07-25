import { z } from "zod";

import { EpochMillis, HoldId, HolderId, SeatIdList } from "./ids.ts";

/**
 * Domain events — facts, past tense (D1-02). Each is something that *has happened* to a show and
 * is appended to that show's stream. An event's `type` discriminates its `payload`; the show is
 * implicit in the stream it lives on, so **no event payload repeats `showId`** — that identity is
 * the envelope's `streamId` (see `DomainEvent` in index.ts).
 *
 * Shape is `{ type, payload }` so a fact slots straight into the persistence envelope
 * (`{ type, streamId, revision, payload }`) — the store adds `streamId`/`revision` on append.
 */

/** A show's seat inventory was defined. */
export const ShowScheduledPayload = z.object({ seatIds: SeatIdList });
export const ShowScheduled = z.object({
  type: z.literal("ShowScheduled"),
  payload: ShowScheduledPayload,
});
export type ShowScheduled = z.infer<typeof ShowScheduled>;

/** Seats were held atomically under one hold, expiring at `expiresAt` (epoch millis). */
export const SeatsHeldPayload = z.object({
  holdId: HoldId,
  seatIds: SeatIdList,
  holderId: HolderId,
  expiresAt: EpochMillis,
});
export const SeatsHeld = z.object({
  type: z.literal("SeatsHeld"),
  payload: SeatsHeldPayload,
});
export type SeatsHeld = z.infer<typeof SeatsHeld>;

/** A hold was explicitly released; its seats return to available. */
export const HoldReleasedPayload = z.object({ holdId: HoldId });
export const HoldReleased = z.object({
  type: z.literal("HoldReleased"),
  payload: HoldReleasedPayload,
});
export type HoldReleased = z.infer<typeof HoldReleased>;

/** A hold reached its TTL without being confirmed; its seats return to available. */
export const HoldExpiredPayload = z.object({ holdId: HoldId });
export const HoldExpired = z.object({
  type: z.literal("HoldExpired"),
  payload: HoldExpiredPayload,
});
export type HoldExpired = z.infer<typeof HoldExpired>;

/** A hold was confirmed into a sale; its seats are permanently sold. */
export const SeatsSoldPayload = z.object({ holdId: HoldId, seatIds: SeatIdList });
export const SeatsSold = z.object({
  type: z.literal("SeatsSold"),
  payload: SeatsSoldPayload,
});
export type SeatsSold = z.infer<typeof SeatsSold>;

/**
 * Every M1 event fact, discriminated by `type` — the aggregate emits and folds these, and can
 * switch over them exhaustively.
 */
export const DomainEventSchema = z.discriminatedUnion("type", [
  ShowScheduled,
  SeatsHeld,
  HoldReleased,
  HoldExpired,
  SeatsSold,
]);
export type DomainEventFact = z.infer<typeof DomainEventSchema>;
export type DomainEventType = DomainEventFact["type"];
