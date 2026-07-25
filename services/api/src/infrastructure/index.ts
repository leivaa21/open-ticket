/**
 * Infrastructure adapters — the only layer that touches I/O, the clock, or randomness. Each
 * fulfils an `application/` port; swapping one (e.g. the in-memory store for EventStoreDB) moves
 * no domain or use-case code.
 */

export { InMemoryEventStore } from "./in-memory-event-store.ts";
export { SystemClock, UuidGenerator } from "./system-adapters.ts";
