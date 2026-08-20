import { z } from "zod";

/**
 * A position in the global `$all` log, as it crosses the wire (D4-01).
 *
 * **Opaque by construction.** This used to be a contiguous 0-based counter, which was only ever
 * true of the in-memory store: EventStoreDB's `$all` positions are commit/prepare byte offsets —
 * monotonic and totally ordered, but not contiguous, not counts, and not convertible into "how
 * many events behind" without reading the log. Rather than have the adapter fake a counter (a lie
 * that breaks across restarts and across a second instance), the position became a token whose
 * **only** guaranteed operations are equality and a server-side total order.
 *
 * So: a client may store it, echo it back, and compare it for equality — and must not parse it,
 * order it, subtract it, or assume anything about its contents. **Ordering is the server's job**,
 * because only the store's own adapter knows how to compare two of these (`Position.compareTo` in
 * the API's shared application layer). Read-your-writes is still `asOf >= commitPosition`; it is
 * now evaluated where the comparator lives rather than in the caller.
 */
export const PositionToken = z.string().min(1);
export type PositionToken = z.infer<typeof PositionToken>;
