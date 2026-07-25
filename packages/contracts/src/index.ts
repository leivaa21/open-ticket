/**
 * @open-ticket/contracts — the single source of truth for the shapes crossing the wire and the
 * event log: commands (intent), domain events (facts), and read-model DTOs. The API validates
 * inbound payloads against these zod schemas; the web app imports the inferred types and trusts
 * them. A shape lives here once — it must not be re-declared in the API or the app.
 *
 * Layout:
 *   - `ids.ts`      — branded id + primitive value schemas (ShowId, SeatId, SeatIdList, …)
 *   - `commands.ts` — the four M1 commands + the `Command` discriminated union
 *   - `events.ts`   — the five M1 event facts + the `DomainEventFact` discriminated union
 *   - this file     — the persistence envelope + re-exports
 */

import type { DomainEventFact } from "./events.ts";

export * from "./ids.ts";
export * from "./commands.ts";
export * from "./events.ts";

/**
 * The envelope wrapping every persisted domain event. `type` discriminates the payload,
 * `streamId` names the aggregate instance (per-show stream, so it is the show's id), `revision`
 * is its 0-based position in that stream — the basis for optimistic concurrency on append. The
 * store adds `streamId` and `revision`; the domain emits the bare `{ type, payload }` fact.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly streamId: string;
  readonly revision: number;
  readonly payload: TPayload;
}

/**
 * A persisted M1 event: the envelope specialized to each concrete fact, so `type` and `payload`
 * stay in lockstep (a `SeatsSold` envelope carries a `SeatsSold` payload, never another's). This
 * is the shape the event store reads and appends.
 */
export type PersistedEvent<TFact extends DomainEventFact = DomainEventFact> =
  TFact extends DomainEventFact ? DomainEvent<TFact["type"], TFact["payload"]> : never;
