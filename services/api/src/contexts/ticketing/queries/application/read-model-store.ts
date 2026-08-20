import type { Position } from "../../shared/application/index.ts";
import type { SeatMapState } from "../domain/seat-map.ts";

/**
 * In-memory read-model store (D2-06): per-show SeatMap state plus the projection's high-water
 * mark — the last position applied and the store-recorded time of that event. A passive holder —
 * the `Projector` routes and reduces; the query layer reads. Disposable and rebuildable: a fresh
 * store replayed from the start of the log reconstructs identical state (M4 slice 4 makes that a
 * button).
 *
 * The high-water mark is a pair, not a position alone, because lag is reported in time (D4-01):
 * `behindMs` needs the `recordedAt` of the last applied event, and keeping the two together is
 * what makes them impossible to advance out of step.
 */
export class ReadModelStore {
  private readonly shows = new Map<string, SeatMapState>();
  private applied: Position | null = null;
  private appliedRecordedAt: number | null = null;

  getShow(showId: string): SeatMapState | undefined {
    return this.shows.get(showId);
  }

  setShow(showId: string, state: SeatMapState): void {
    this.shows.set(showId, state);
  }

  /** The highest position applied so far, or `null` if nothing has been applied yet. */
  get asOf(): Position | null {
    return this.applied;
  }

  /** When the store recorded the last applied event — the basis for `behindMs`. */
  get asOfRecordedAt(): number | null {
    return this.appliedRecordedAt;
  }

  /**
   * Advance the high-water mark. Monotonic by construction (the subscription delivers positions in
   * order); the comparison makes that a guarantee rather than an assumption, so `asOf` can never
   * regress — and, unlike the `Math.max` it replaced, it works on a position that is not a number.
   */
  advanceApplied(position: Position, recordedAt: number): void {
    if (this.applied !== null && position.compareTo(this.applied) <= 0) return;
    this.applied = position;
    this.appliedRecordedAt = recordedAt;
  }
}
