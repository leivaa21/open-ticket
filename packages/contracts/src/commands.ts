import { z } from "zod";

import { HoldId, HolderId, SeatIdList, ShowId } from "./ids.ts";

/**
 * Commands — intent, imperative, present tense (D1-02). A client asks the write side to *do*
 * something; the domain decides whether it's allowed. Each command names its target show
 * (`showId` = the aggregate/stream it routes to) and carries a `type` discriminant so a command
 * bus and the domain can switch over them exhaustively.
 *
 * These schemas are the authority for inbound wire validation — the API parses request payloads
 * against them before any of this reaches the domain (workspace rule: validate at the edge).
 */

/** Define a show's full seat inventory. */
export const ScheduleShow = z.object({
  type: z.literal("ScheduleShow"),
  showId: ShowId,
  seatIds: SeatIdList,
});
export type ScheduleShow = z.infer<typeof ScheduleShow>;

/**
 * Place an atomic, all-or-nothing hold on one or more seats under a single `holdId` for
 * `holderId`. If any requested seat is unavailable the whole hold fails (decided in the domain).
 */
export const ReserveSeats = z.object({
  type: z.literal("ReserveSeats"),
  showId: ShowId,
  seatIds: SeatIdList,
  holderId: HolderId,
});
export type ReserveSeats = z.infer<typeof ReserveSeats>;

/** Turn a live hold into a sale. */
export const ConfirmPurchase = z.object({
  type: z.literal("ConfirmPurchase"),
  showId: ShowId,
  holdId: HoldId,
});
export type ConfirmPurchase = z.infer<typeof ConfirmPurchase>;

/** Explicitly release a live hold, returning its seats to available. */
export const ReleaseHold = z.object({
  type: z.literal("ReleaseHold"),
  showId: ShowId,
  holdId: HoldId,
});
export type ReleaseHold = z.infer<typeof ReleaseHold>;

/** Every M1 command, discriminated by `type` — parse inbound payloads against this. */
export const CommandSchema = z.discriminatedUnion("type", [
  ScheduleShow,
  ReserveSeats,
  ConfirmPurchase,
  ReleaseHold,
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command["type"];
