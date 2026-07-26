/**
 * Shared infrastructure — adapters used by BOTH sides of the context, the only code here that
 * touches an external system, the clock, or randomness. The in-memory store fulfils the command
 * `EventStore` port and the query `EventLog` port at once (one append lands in a stream and in the
 * `$all` log); the system adapters back the shared `Clock` port and the command `IdGenerator` port.
 * Swapping one (e.g. the in-memory store for EventStoreDB) moves no domain or use-case code.
 */

export { InMemoryEventStore } from "./in-memory-event-store.ts";
export { SystemClock, UuidGenerator } from "./system-adapters.ts";
