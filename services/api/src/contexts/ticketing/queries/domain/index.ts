/**
 * Query-side domain — the read model itself: the pure SeatMap reducer and the time-aware queries
 * that resolve effective seat status against a clock (D2-04 lazy expiry). No I/O, no framework;
 * depends only on contracts types. This is the "domain" of the read side, not the write aggregate.
 */

export { applySeatMap, emptySeatMap } from "./seat-map.ts";
export type { RawSeatStatus, SeatMapState } from "./seat-map.ts";
export { availabilityAsOf, effectiveStatus, seatMapAsOf } from "./queries.ts";
export type { Availability, EffectiveStatus, ResolvedSeat } from "./queries.ts";
