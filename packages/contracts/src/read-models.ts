import { z } from "zod";

import { SeatId, ShowId } from "./ids.ts";
import { PositionToken } from "./positions.ts";

/**
 * Read-model DTOs (D2-05) — the client-facing shapes the read API returns. Unlike `GlobalEvent`
 * (internal `$all` plumbing that never crosses the wire), these ARE wire shapes, so they live in
 * contracts: the shape lives once and the web app imports the inferred types (contracts don't fork).
 *
 * Every read carries `asOf`: the global `$all` position the projection reflects, as an **opaque
 * token** (D4-01 — see `positions.ts` for why it is not a number any more). Reads are eventually
 * consistent, and `asOf >= commitPosition` still means "your write is visible" — but that ordering
 * is now the server's to evaluate, since only the store's adapter knows how to compare two
 * positions. A client may echo a token back and compare it for equality; it must not parse or
 * order it. `null` means the projection has applied nothing yet.
 */
export const SeatStatus = z.enum(["available", "held", "sold"]);
export type SeatStatus = z.infer<typeof SeatStatus>;

export const SeatView = z.object({ seatId: SeatId, status: SeatStatus });
export type SeatView = z.infer<typeof SeatView>;

/** `GET /shows/:showId/seats` */
export const SeatMapView = z.object({
  showId: ShowId,
  asOf: PositionToken.nullable(),
  seats: z.array(SeatView),
});
export type SeatMapView = z.infer<typeof SeatMapView>;

/** `GET /shows/:showId` — the availability summary. */
export const AvailabilityView = z.object({
  showId: ShowId,
  asOf: PositionToken.nullable(),
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
  position: PositionToken,
  type: z.string(),
  showId: z.string(),
});
export type DevAppended = z.infer<typeof DevAppended>;

/**
 * `event: lag` — how far the projection trails the write head (the lag meter).
 *
 * **Time, not events** (D4-01). `behindMs` is `now − recordedAt` of the last applied event, and
 * `0` exactly when the projection is caught up. It is the one unit every adapter can produce and a
 * human can read; an event count is not, because a store whose positions are byte offsets cannot
 * answer "how many" without reading the log.
 *
 * `behindEvents` is therefore **optional**, populated only by adapters that can supply it for free
 * — the in-memory log can (its positions are indices), EventStoreDB cannot. Render it when it is
 * there; never require it.
 */
export const DevLag = z.object({
  behindMs: z.number().int().nonnegative(),
  behindEvents: z.number().int().nonnegative().optional(),
});
export type DevLag = z.infer<typeof DevLag>;
