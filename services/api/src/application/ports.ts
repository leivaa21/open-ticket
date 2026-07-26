import type { DomainEventFact, EpochMillis, HoldId, PersistedEvent } from "@open-ticket/contracts";

/**
 * Ports the use cases orchestrate the domain through (hexagonal, dependency-inward). Interfaces
 * are declared here; `infrastructure/` provides adapters. The domain-facing code knows only these.
 */

/**
 * Revision sentinel: the stream has no events yet. Revisions are 0-based per event (a stream of N
 * events has last revision N-1), so "no stream" is -1. Appending with `expectedRevision = NO_STREAM`
 * is how a stream is created — its first event lands at revision 0.
 */
export const NO_STREAM = -1;

export interface ReadResult {
  readonly events: readonly PersistedEvent[];
  /** The last event's revision, or `NO_STREAM` for an empty/absent stream. */
  readonly revision: number;
}

export interface AppendResult {
  /** The stream's new last revision after the append (per-stream, optimistic concurrency). */
  readonly revision: number;
  /**
   * The global `$all` position of the LAST appended event — the write's commit position. A reader
   * comparing a projection's `asOf` to this knows whether its write is visible yet (D2-05).
   */
  readonly globalPosition: number;
}

/**
 * EventStore port, modelled on EventStoreDB (D1-04). `appendToStream` assigns sequential revisions
 * to the bare `{ type, payload }` facts and succeeds only if the stream's current revision still
 * equals `expectedRevision` (the revision you read); otherwise it throws `ConcurrencyError`. That
 * expected-revision check is optimistic concurrency, and the reason the real client is a drop-in.
 */
export interface EventStore {
  readStream(streamId: string): Promise<ReadResult>;
  appendToStream(
    streamId: string,
    expectedRevision: number,
    newFacts: readonly DomainEventFact[],
  ): Promise<AppendResult>;
}

/** Thrown by `appendToStream` when the stream moved under an optimistic write (D1-04). */
export class ConcurrencyError extends Error {
  override readonly name = "ConcurrencyError";
  // Explicit fields (not constructor parameter properties): the API's dev script runs on Node's
  // strip-only type stripping, which rejects parameter properties — so `pnpm dev` would crash.
  readonly streamId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(streamId: string, expectedRevision: number, actualRevision: number) {
    super(
      `concurrency conflict on stream "${streamId}": expected revision ` +
        `${String(expectedRevision)}, found ${String(actualRevision)}`,
    );
    this.streamId = streamId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/** Time as a port (D1-03) — deterministic in tests, `Date.now()`-backed in production. */
export interface Clock {
  now(): EpochMillis;
}

/** Hold-id generation as a port (D1-07) — deterministic in tests, crypto-backed in production. */
export interface IdGenerator {
  nextHoldId(): HoldId;
}
