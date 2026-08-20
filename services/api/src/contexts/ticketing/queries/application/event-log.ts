import type { PersistedEvent } from "@open-ticket/contracts";

import type { Position } from "../../shared/application/index.ts";

/**
 * The read-side of the store: a global, positioned `$all` log (D2-02), separate from the
 * write-side `EventStore` (the CQRS split — one adapter may implement both). Catch-up subscribers
 * pull `readAll(after)`, then react to `onCommitted` wake-ups by pulling again.
 *
 * `GlobalEvent` lives in the application layer, NOT in `@open-ticket/contracts`: it is read-side
 * plumbing between the store and the projector and never crosses the wire. The only client-facing
 * piece is a position surfaced as `asOf` inside the read DTOs, and it crosses as an opaque token.
 */

/** A persisted event plus the global position the log assigned it (D4-01: opaque, not a number). */
export type GlobalEvent = PersistedEvent & { readonly position: Position };

export interface ReadAllResult {
  readonly events: readonly GlobalEvent[];
  /** The LAST appended position, or `null` for an empty log. */
  readonly head: Position | null;
}

/** Live wake-up: the log calls each registered listener after a successful append (pull-based). */
export type CommitListener = () => void;

export interface EventLog {
  /**
   * Events strictly **after** `after`, plus the current head; `null` reads from the beginning.
   *
   * Exclusive, not inclusive-from — the old signature took "the next position to read", which
   * only a contiguous counter can express (`lastApplied + 1`). An opaque token has no successor,
   * so a catch-up reader can only say "everything after the last one I applied". EventStoreDB's
   * `$all` read works exactly this way, which is the point.
   */
  readAll(after: Position | null): Promise<ReadAllResult>;
  /** The last appended position synchronously, or `null` if the log is empty. For lag reporting. */
  head(): Position | null;
  /** Registers a commit wake-up; returns an unsubscribe handle. The listener must not throw. */
  onCommitted(listener: CommitListener): () => void;
  /**
   * OPTIONAL (D4-01): how many events lie strictly after `after`. Implemented only by adapters
   * that can answer for free — the in-memory log can, since its positions are array indices;
   * EventStoreDB cannot, because byte offsets are not counts. Absent means "this store does not
   * know", never "zero".
   */
  behindEvents?(after: Position | null): number;
}
