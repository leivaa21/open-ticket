import type { PersistedEvent } from "@open-ticket/contracts";

/**
 * The read-side of the store: a global, positioned `$all` log (D2-02), separate from the
 * write-side `EventStore` (the CQRS split — one adapter may implement both). Catch-up subscribers
 * pull `readAll(from)`, then react to `onCommitted` wake-ups by pulling again.
 *
 * These types live in the application layer, NOT in `@open-ticket/contracts`: `GlobalEvent` is
 * read-side plumbing between the store and the projector — it never crosses the wire. The only
 * client-facing piece is a position surfaced as `asOf` inside the read DTOs (M2 PR3, in contracts).
 */

/**
 * A global 0-based position in the `$all` log — monotonic across every stream, assigned at append
 * time. Like a stream revision but log-wide. A plain `number`, mirroring `revision`.
 */
export type GlobalPosition = number;

/** A persisted event plus the global position the log assigned it. */
export type GlobalEvent = PersistedEvent & { readonly globalPosition: GlobalPosition };

export interface ReadAllResult {
  readonly events: readonly GlobalEvent[];
  /**
   * The next position to be assigned = the count of events appended so far. An empty log has
   * `head` 0; after N events `head` is N (positions 0..N-1 used). `readAll(head)` returns no events.
   * Mirrors `revision`'s convention where an empty stream is `NO_STREAM` (-1), one before the first.
   */
  readonly head: GlobalPosition;
}

/** Live wake-up: the log calls each registered listener after a successful append (pull-based). */
export type CommitListener = () => void;

export interface EventLog {
  /** Events with `globalPosition >= fromPosition`, plus the current `head`. */
  readAll(fromPosition: GlobalPosition): Promise<ReadAllResult>;
  /** The write head synchronously — the next position = count of appended events. For lag reporting. */
  head(): GlobalPosition;
  /** Registers a commit wake-up; returns an unsubscribe handle. The listener must not throw. */
  onCommitted(listener: CommitListener): () => void;
}
