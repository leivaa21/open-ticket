# shared / infrastructure

Adapters shared by **both** sides of the context — the only layer that touches I/O, the clock, or
randomness. It fulfils ports from both `commands/application` and `queries/application`, which is
why it lives under `shared/` rather than inside either side.

- **`in-memory-event-store.ts`** — one adapter implementing the command `EventStore` port and the
  query `EventLog` port at once. Its semantics mirror the target production store,
  [EventStoreDB](https://www.eventstore.com/): append-to-stream with an **expected revision**
  (rejecting a concurrent write whose revision moved), a per-stream read, and a global positioned
  `$all` log with catch-up reads. Because the ports are modelled on those semantics, swapping in
  the real EventStoreDB client later is a drop-in change — no domain or use-case code moves.
- **`system-adapters.ts`** — the production `Clock` (wall-clock) and `IdGenerator` (UUID) adapters.
- **`broadcaster.ts`** — the in-process typed pub/sub (D3-03) the projector feeds and the SSE
  controllers consume; no message bus, consistent with the "no Kafka/RabbitMQ" non-goal.
