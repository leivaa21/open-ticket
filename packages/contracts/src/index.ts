/**
 * @open-ticket/contracts — the single source of truth for the shapes crossing the wire and the
 * event log: commands (intent), domain events (facts), and read-model DTOs. The API validates
 * inbound payloads against these zod schemas; the web app imports the inferred types and trusts
 * them. A shape lives here once — it must not be re-declared in the API or the app.
 *
 * M1 fills in the concrete Show events and reservation commands; this file currently anchors the
 * event-sourcing envelope every domain event shares.
 */

/**
 * The envelope wrapping every persisted domain event. `type` discriminates the payload,
 * `streamId` names the aggregate instance (per-show stream), `revision` is its 0-based position
 * in that stream — the basis for optimistic concurrency on append.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly streamId: string;
  readonly revision: number;
  readonly payload: TPayload;
}
