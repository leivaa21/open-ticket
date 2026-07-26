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

/**
 * Dashboard SSE DTOs for `GET /dev/stream` (D3-02) — the shapes the API's dev feed produces and the
 * web dashboard consumes. They live here for the same reason as the read views: the wire shape lives
 * once (contracts don't fork). `showId` is the raw stream id (a display field), not branded.
 */

/** `event: appended` — a newly-appended `$all` event. */
export const DevAppended = z.object({
  position: z.number().int().nonnegative(),
  type: z.string(),
  showId: z.string(),
});
export type DevAppended = z.infer<typeof DevAppended>;

/** `event: lag` — the projection's position vs the write head (the lag meter). */
export const DevLag = z.object({
  head: z.number().int().nonnegative(),
  asOf: z.number().int(), // -1 when nothing is projected yet
  behind: z.number().int().nonnegative(),
});
export type DevLag = z.infer<typeof DevLag>;
