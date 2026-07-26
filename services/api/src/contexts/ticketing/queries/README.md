# queries

The read side (CQRS query side). It never writes events — it subscribes to the global `$all` log,
folds each event into a seat-map read model, and serves eventually-consistent reads.

- **`domain/`** — the read model itself: `applySeatMap` (the pure reducer, exhaustive over the five
  facts) and the time-aware `queries` that resolve each seat's effective status against a `Clock`
  (D2-04 lazy expiry — a time-expired hold reads as available with no event). Pure; contracts only.
- **`application/`** — the `EventLog` port (the `$all` read + commit wake-ups), the catch-up
  `subscription` (replay history, then stay live), the `Projector` that wires the reducer to the
  log and tracks `asOf`/lag, the `ReadModelStore` it writes into (the in-memory map of show →
  SeatMap; rebuildable from position 0, durable projections are a later milestone), and the `views`
  that shape projector state + the clock into contract read DTOs.

There is no `infrastructure/` folder yet: at the in-memory stage the read model's store is
in-process application machinery, not an external-system adapter. It returns at M4 with the durable
projection store.

The read model is derived state: it can be dropped and rebuilt by replaying the log. Nothing here
decides anything — deciding is the write side's job (`../commands`).
