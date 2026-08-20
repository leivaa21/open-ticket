/**
 * @open-ticket/contracts — the single source of truth for the shapes crossing the wire and the
 * event log: commands (intent), domain events (facts), and read-model DTOs. The API validates
 * inbound payloads against these zod schemas; the web app imports the inferred types and trusts
 * them. A shape lives here once — it must not be re-declared in the API or the app.
 *
 * Layout:
 *   - `ids.ts`         — branded id + primitive value schemas (ShowId, SeatId, SeatIdList, …)
 *   - `commands.ts`    — the four M1 commands + the `Command` discriminated union
 *   - `events.ts`      — the five M1 event facts + the `DomainEventFact` discriminated union
 *   - `positions.ts`   — the opaque `$all` position token (`asOf` / `commitPosition`)
 *   - `read-models.ts` — the read API DTOs (SeatMapView, AvailabilityView) with `asOf`
 *   - this file        — the persistence envelope + re-exports
 */

import type { DomainEventFact } from "./events.ts";

export * from "./ids.ts";
export * from "./commands.ts";
export * from "./events.ts";
export * from "./positions.ts";
export * from "./read-models.ts";

/**
 * The envelope wrapping every persisted domain event. `type` discriminates the payload,
 * `streamId` names the aggregate instance (per-show stream, so it is the show's id), `revision`
 * is its 0-based position in that stream — the basis for optimistic concurrency on append. The
 * store adds `streamId`, `revision` and `recordedAt`; the domain emits the bare `{ type, payload }`
 * fact.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly streamId: string;
  readonly revision: number;
  /**
   * When the store durably recorded this event (epoch millis), assigned at append — EventStoreDB's
   * `created`, and the same thing every real log carries. It is the store's clock, not the domain's:
   * an event's *meaning* never depends on it, so no aggregate or reducer may read it.
   *
   * It exists for one job (D4-01): projection lag in **time**. `behindMs` is `now − recordedAt` of
   * the last applied event, which means the same thing to every adapter and to a human ("the
   * projection is 2.4s behind") — unlike an event count, which only a contiguous-counter store can
   * even produce.
   */
  readonly recordedAt: number;
  readonly payload: TPayload;
}

/**
 * A persisted M1 event: the envelope specialized to each concrete fact, so `type` and `payload`
 * stay in lockstep (a `SeatsSold` envelope carries a `SeatsSold` payload, never another's). This
 * is the shape the event store reads and appends.
 */
export type PersistedEvent<TFact extends DomainEventFact = DomainEventFact> =
  TFact extends DomainEventFact ? DomainEvent<TFact["type"], TFact["payload"]> : never;
