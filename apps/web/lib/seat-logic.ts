import type { SeatView } from "@open-ticket/contracts";

/**
 * Pure seat-interaction logic (kept out of components so it's unit-testable). The seat map view
 * carries only status (available|held|sold) — never who holds a seat — so "ownership" is tracked
 * client-side: `Holds` maps each seat *I* hold to *my* holdId. A seat is "mine" only when it's
 * still held AND in my holds; SSE frames are authoritative for status, so ownership stays honest.
 *
 * Security model (no auth — a demo): client-side ownership is **display only**. Every action is a
 * command the API authorizes on its own terms — a holdId is the sole capability, and the server
 * rejects a confirm/release of an expired or unknown hold. The client grants no privilege the API
 * doesn't enforce; the worst a crafted request does is act on a holdId it happens to know.
 */
export type SeatId = SeatView["seatId"];
export type Ownership = "mine" | "other" | "none";
export type SeatAction = "reserve" | "confirm" | "release";

/** seatId → my holdId, for seats I currently hold. */
export type Holds = ReadonlyMap<string, string>;

export function ownershipOf(seat: SeatView, holds: Holds): Ownership {
  if (seat.status !== "held") return "none";
  return holds.has(seat.seatId) ? "mine" : "other";
}

/** The actions a click can take on a seat, given who owns it. Empty = not interactive. */
export function actionsFor(seat: SeatView, ownership: Ownership): readonly SeatAction[] {
  if (seat.status === "available") return ["reserve"];
  if (seat.status === "held" && ownership === "mine") return ["confirm", "release"];
  return [];
}

export function isInteractive(seat: SeatView, ownership: Ownership): boolean {
  return actionsFor(seat, ownership).length > 0;
}

/**
 * Whether an API error status means the hold the client thought it owned is gone — 404
 * `HoldNotFound` / 410 `HoldExpired`. On a failed confirm/release the client prunes such a hold so
 * a stale "your seat" affordance clears (a hold can lazily expire with no SSE frame until the next
 * event on that show — see D2-04). Display hygiene only; the server is the authority.
 */
export function holdGone(status: number): boolean {
  return status === 404 || status === 410;
}

/**
 * Drop holds for seats no longer held by me — released, expired (lazy, reads available again), or
 * sold — so a stale hold never claims ownership of a seat someone else can take.
 */
export function pruneHolds(holds: Holds, seats: readonly SeatView[]): Holds {
  const heldNow = new Set<string>(
    seats.filter((seat) => seat.status === "held").map((seat) => seat.seatId),
  );
  const next = new Map<string, string>();
  for (const [seatId, holdId] of holds) {
    if (heldNow.has(seatId)) next.set(seatId, holdId);
  }
  return next;
}

export interface SeatCounts {
  readonly total: number;
  readonly available: number;
  readonly held: number;
  readonly sold: number;
}

/** Availability counts for the header, straight off the current view. */
export function countByStatus(seats: readonly SeatView[]): SeatCounts {
  let available = 0;
  let held = 0;
  let sold = 0;
  for (const seat of seats) {
    if (seat.status === "available") available += 1;
    else if (seat.status === "held") held += 1;
    else sold += 1;
  }
  return { total: seats.length, available, held, sold };
}

export interface SeatRow {
  readonly label: string;
  readonly seats: readonly SeatView[];
}

/**
 * Arrange a flat seat list into venue rows: group by the id's letter prefix ("A1" → row "A"),
 * ordered by seat number. Ids without an `A12` shape fall into a single unlabeled row.
 */
export function toRows(seats: readonly SeatView[]): readonly SeatRow[] {
  const byRow = new Map<string, SeatView[]>();
  for (const seat of seats) {
    const rowLabel = /^(\D+)\d+$/.exec(seat.seatId)?.[1] ?? "";
    const bucket = byRow.get(rowLabel) ?? [];
    bucket.push(seat);
    byRow.set(rowLabel, bucket);
  }
  return [...byRow.entries()]
    .map(([label, group]) => ({
      label,
      seats: [...group].sort((a, b) => seatNumber(a.seatId) - seatNumber(b.seatId)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function seatNumber(seatId: string): number {
  const digits = /(\d+)$/.exec(seatId)?.[1];
  return digits === undefined ? 0 : Number(digits);
}
