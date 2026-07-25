import type { GlobalPosition } from "../event-log.ts";

import type { SeatMapState } from "./seat-map.ts";

/** Global position sentinel: the projection has applied nothing yet (before the first event). */
export const NOT_PROJECTED: GlobalPosition = -1;

/**
 * In-memory read-model store (D2-06): per-show SeatMap state plus the projection's high-water
 * `asOf` position. A passive holder — the `Projector` routes and reduces; the query layer reads.
 * Disposable and rebuildable: a fresh store replayed from position 0 reconstructs identical state.
 * (A persisted/swappable read store is M4; for now it mirrors the in-memory event store.)
 */
export class ReadModelStore {
  private readonly shows = new Map<string, SeatMapState>();
  private position: GlobalPosition = NOT_PROJECTED;

  getShow(showId: string): SeatMapState | undefined {
    return this.shows.get(showId);
  }

  setShow(showId: string, state: SeatMapState): void {
    this.shows.set(showId, state);
  }

  /** The highest global position applied so far, or `NOT_PROJECTED` if none. */
  get asOf(): GlobalPosition {
    return this.position;
  }

  advanceAsOf(position: GlobalPosition): void {
    // Monotonic by construction (the subscription delivers positions in order); `max` makes that
    // a guarantee rather than an assumption, so asOf can never regress.
    this.position = Math.max(this.position, position);
  }
}
