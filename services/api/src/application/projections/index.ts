/**
 * The read side (CQRS query side): pure SeatMap reducers, a time-aware query layer, an in-memory
 * read-model store, and the Projector wiring them to the event log via a catch-up subscription.
 * Lives in `application/` (not `domain/`) because these are query-side read models — not the write
 * aggregate — and they depend only inward: on contracts types and the application `EventLog` port.
 */

export { applySeatMap, emptySeatMap } from "./seat-map.ts";
export type { RawSeatStatus, SeatMapState } from "./seat-map.ts";
export { availabilityAsOf, effectiveStatus, seatMapAsOf } from "./queries.ts";
export type { Availability, EffectiveStatus, ResolvedSeat } from "./queries.ts";
export { NOT_PROJECTED, ReadModelStore } from "./read-model-store.ts";
export { Projector } from "./projector.ts";
export type { ProjectorDeps } from "./projector.ts";
