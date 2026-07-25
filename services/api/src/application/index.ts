/**
 * Application layer — use cases orchestrating the domain through ports (declared here), with
 * optimistic-concurrency append and bounded retry (D1-04/D1-05). No framework, no HTTP.
 */

export { NO_STREAM, ConcurrencyError } from "./ports.ts";
export type { AppendResult, Clock, EventStore, IdGenerator, ReadResult } from "./ports.ts";
export { conflict, rejectWith, succeed } from "./results.ts";
export type { Conflict, Rejection, UseCaseResult } from "./results.ts";
export { commitWithRetry } from "./optimistic.ts";
export type { CommitPlan, PlanResult } from "./optimistic.ts";
export { confirmPurchase, releaseHold, reserveSeats, scheduleShow } from "./use-cases.ts";
export type { CommitOutcome, ReserveOutcome, UseCaseDeps } from "./use-cases.ts";
export type {
  CommitListener,
  EventLog,
  GlobalEvent,
  GlobalPosition,
  ReadAllResult,
} from "./event-log.ts";
export { microtaskScheduler, subscribe } from "./subscription.ts";
export type { Scheduler, SubscribeOptions, Subscription } from "./subscription.ts";
export { Broadcaster } from "./broadcaster.ts";
export type { BroadcastEvents, BroadcastType, LagSnapshot } from "./broadcaster.ts";
export * from "./projections/index.ts";
