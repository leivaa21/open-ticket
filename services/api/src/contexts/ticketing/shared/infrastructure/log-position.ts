import { IncomparablePositionsError } from "../application/index.ts";
import type { Position } from "../application/index.ts";

/**
 * The in-memory log's `Position`: the event's 0-based index in the `$all` array.
 *
 * The index stays *inside* the adapter — this is precisely the knowledge the port stopped
 * exposing (D4-01). Because it is an index, this adapter can answer `behindEvents` for free, which
 * is why that method is optional on the port rather than absent from it: the in-memory store gets
 * to keep the nicer number without every store having to fake one.
 */
export class LogPosition implements Position {
  readonly index: number;

  // Explicit field + assignment, never a constructor parameter property: `pnpm dev` runs the API
  // through Node's strip-only type stripping, which rejects those outright.
  constructor(index: number) {
    this.index = index;
  }

  get token(): string {
    return String(this.index);
  }

  compareTo(other: Position): number {
    if (!(other instanceof LogPosition)) throw new IncomparablePositionsError(this, other);
    return this.index - other.index;
  }
}
