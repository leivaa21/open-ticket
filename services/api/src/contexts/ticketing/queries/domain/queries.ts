import type { EpochMillis, SeatId } from "@open-ticket/contracts";

import type { RawSeatStatus, SeatMapState } from "./seat-map.ts";

/**
 * The time-aware read of a SeatMap (D2-04). The reducer stores a held seat's `expiresAt` but never
 * judges it; these queries resolve EFFECTIVE status against an injected `now`, mirroring the
 * domain's lazy expiry so reads agree with what a `ReserveSeats` would actually allow. Sold is
 * terminal (ignores the clock); a held seat past its expiry reads available again.
 */
export type EffectiveStatus = "available" | "held" | "sold";

export interface ResolvedSeat {
  readonly seatId: SeatId;
  readonly status: EffectiveStatus;
}

export interface Availability {
  readonly total: number;
  readonly available: number;
  readonly held: number;
  readonly sold: number;
}

/**
 * Effective status at `now`. A hold is live **iff `expiresAt > now`** (strictly greater) — exactly
 * the domain's predicate (D1-03): at `now === expiresAt` the hold is dead and the seat is available.
 */
export function effectiveStatus(raw: RawSeatStatus, now: EpochMillis): EffectiveStatus {
  if (raw.kind === "sold") return "sold";
  if (raw.kind === "held") return raw.expiresAt > now ? "held" : "available";
  return "available";
}

/** The show's seats resolved to effective status at `now`, in inventory order. */
export function seatMapAsOf(state: SeatMapState, now: EpochMillis): readonly ResolvedSeat[] {
  const resolved: ResolvedSeat[] = [];
  for (const [seatId, raw] of state.seats) {
    resolved.push({ seatId, status: effectiveStatus(raw, now) });
  }
  return resolved;
}

/** Availability counts at `now`, derived from the same liveness rule (O(seats), no double-maintenance). */
export function availabilityAsOf(state: SeatMapState, now: EpochMillis): Availability {
  let available = 0;
  let held = 0;
  let sold = 0;
  for (const raw of state.seats.values()) {
    const status = effectiveStatus(raw, now);
    if (status === "available") available += 1;
    else if (status === "held") held += 1;
    else sold += 1;
  }
  return { total: state.seats.size, available, held, sold };
}
