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

/** `behindMs` is 0 exactly when the projection has reached the head (D4-01) — that IS the state. */
export function lagState(lag: DevLag): LagState {
  return lag.behindMs === 0 ? "caught-up" : "behind";
}

/**
 * How far behind the meter is allowed to read before it bottoms out. Lag is now a duration, not a
 * fraction of a known total, so the bar needs a reference window — and a duration has no natural
 * ceiling. 5s is chosen to match what the M4 control panel can dial in (delay is bounded at 10s
 * per event, so a couple of paced events already pin the meter): far enough that ordinary jitter
 * barely moves it, close enough that a deliberate throttle drives it to empty on screen.
 */
export const LAG_SCALE_MS = 5_000;

/** Meter fill: 1 = caught up, 0 = at or beyond `LAG_SCALE_MS` behind. */
export function lagFraction(lag: DevLag): number {
  if (lag.behindMs <= 0) return 1;
  return Math.max(0, 1 - lag.behindMs / LAG_SCALE_MS);
}

/** "2.4s" / "840ms" — the headline the meter reads out. */
export function formatLag(behindMs: number): string {
  if (behindMs < 1000) return `${String(Math.round(behindMs))}ms`;
  return `${(behindMs / 1000).toFixed(1)}s`;
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
