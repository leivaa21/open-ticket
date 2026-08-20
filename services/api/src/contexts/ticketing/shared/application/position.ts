import type { PositionToken } from "@open-ticket/contracts";

/**
 * A position in the global `$all` log (D4-01): an opaque, totally-ordered value produced by the
 * store's adapter, which is the only thing that knows how to compare two of them.
 *
 * This replaced a plain `number`. The old port defined a position as a contiguous 0-based counter
 * where the head was literally the event count — true of the in-memory log, false of EventStoreDB,
 * whose `$all` positions are commit/prepare byte offsets. A faithful adapter could not satisfy the
 * old port, and having it maintain a private counter instead would have been a correctness lie
 * that breaks across restarts and across a second instance.
 *
 * It lives in `shared/application` because both sides need it: the write side returns one as a
 * commit position, the read side consumes and reports one as `asOf`.
 */
export interface Position {
  /** The wire form — what `asOf` and `commitPosition` carry. Opaque to clients (see contracts). */
  readonly token: PositionToken;
  /**
   * Total order **within one store's log**: negative / zero / positive, like a sort comparator.
   * Comparing positions from two different stores is meaningless and throws rather than guessing.
   */
  compareTo(other: Position): number;
}

/** Thrown when two positions from different adapters are compared — a wiring bug, not a data case. */
export class IncomparablePositionsError extends Error {
  override readonly name = "IncomparablePositionsError";

  constructor(left: Position, right: Position) {
    super(`positions from different logs are not comparable: "${left.token}" vs "${right.token}"`);
  }
}

/**
 * The read-your-writes predicate (D2-05), now that neither side can be compared with `>=`:
 * `asOf >= commitPosition` means the write is visible. `null` is "nothing applied yet", which is
 * never at-or-after anything.
 */
export function isAtOrAfter(asOf: Position | null, target: Position): boolean {
  return asOf !== null && asOf.compareTo(target) >= 0;
}

/** Equality, tolerating the "nothing yet" case on either side. */
export function positionsEqual(left: Position | null, right: Position | null): boolean {
  if (left === null || right === null) return left === right;
  return left.compareTo(right) === 0;
}

/** Wire form of an optional position — `null` when nothing has been appended or applied yet. */
export function tokenOf(position: Position | null): PositionToken | null {
  return position === null ? null : position.token;
}
