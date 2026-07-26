import type { DevAppended, DevLag } from "@open-ticket/contracts";

/**
 * Pure dashboard logic (kept out of components so it's unit-testable): the bounded rolling event
 * buffer, and the lag → display mappings the lag meter and feed rows read.
 */

/** Prepend the newest event and cap the buffer, so memory stays bounded (newest first). */
export function pushEvent(
  buffer: readonly DevAppended[],
  event: DevAppended,
  max: number,
): DevAppended[] {
  return [event, ...buffer].slice(0, Math.max(0, max));
}

export type LagState = "caught-up" | "behind";

export function lagState(lag: DevLag): LagState {
  return lag.behind === 0 ? "caught-up" : "behind";
}

/** Fraction of the write head the projection has processed (1 = caught up), for the meter fill. */
export function lagFraction(lag: DevLag): number {
  if (lag.head <= 0) return 1; // nothing to process yet ⇒ caught up
  const processed = lag.head - lag.behind;
  return Math.max(0, Math.min(1, processed / lag.head));
}

/** A themed colour class per event type (reuses the seat-status palette where it's meaningful). */
export function eventTypeColor(type: string): string {
  switch (type) {
    case "SeatsSold":
      return "text-sold";
    case "SeatsHeld":
      return "text-held";
    case "HoldReleased":
      return "text-mine";
    case "HoldExpired":
      return "text-slate-500";
    default:
      return "text-slate-300";
  }
}
