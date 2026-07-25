import { z } from "zod";

import { SeatId, ShowId } from "./ids.ts";

/**
 * Read-model DTOs (D2-05) — the client-facing shapes the read API returns. Unlike `GlobalEvent`
 * (internal `$all` plumbing that never crosses the wire), these ARE wire shapes, so they live in
 * contracts: the shape lives once and the web app imports the inferred types (contracts don't fork).
 *
 * Every read carries `asOf`: the global `$all` position the projection reflects. Reads are
 * eventually consistent — compare `asOf` to a write's returned `commitPosition`: **`asOf >=
 * commitPosition` means your write is visible.** That comparison is the whole point of surfacing a
 * global position on both sides; there is no read-your-writes wait in M2 (the client decides).
 */
export const SeatStatus = z.enum(["available", "held", "sold"]);
export type SeatStatus = z.infer<typeof SeatStatus>;

export const SeatView = z.object({ seatId: SeatId, status: SeatStatus });
export type SeatView = z.infer<typeof SeatView>;

/** `GET /shows/:showId/seats` */
export const SeatMapView = z.object({
  showId: ShowId,
  asOf: z.number().int(),
  seats: z.array(SeatView),
});
export type SeatMapView = z.infer<typeof SeatMapView>;

/** `GET /shows/:showId` — the availability summary. */
export const AvailabilityView = z.object({
  showId: ShowId,
  asOf: z.number().int(),
  total: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
});
export type AvailabilityView = z.infer<typeof AvailabilityView>;
