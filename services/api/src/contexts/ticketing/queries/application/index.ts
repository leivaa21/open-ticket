/**
 * Query-side application layer — the read side (CQRS query side): the `$all` `EventLog` port, a
 * catch-up subscription, the Projector wiring the reducer to the log, and the view builders that
 * shape projector state + the clock into contract read DTOs. Depends inward on the query domain,
 * the `EventLog` port, and contracts types.
 */

export type { CommitListener, EventLog, GlobalEvent, ReadAllResult } from "./event-log.ts";
export { microtaskScheduler, subscribe } from "./subscription.ts";
export type { Scheduler, SubscribeOptions, Subscription } from "./subscription.ts";
export { Projector } from "./projector.ts";
export type { ProjectorDeps } from "./projector.ts";
export { buildAvailabilityView, buildSeatMapView } from "./views.ts";
export { ReadModelStore } from "./read-model-store.ts";
