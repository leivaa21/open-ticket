# infrastructure

Adapters that fulfil the `application/` ports against the outside world — the only layer that
touches I/O, the clock, or randomness.

M1 ships an **in-memory `EventStore`** whose semantics mirror the target production store,
[EventStoreDB](https://www.eventstore.com/): append-to-stream with an **expected revision**
(rejecting a concurrent write whose revision moved), plus a per-stream read. Because the port is
modelled on those semantics, swapping the in-memory adapter for the real EventStoreDB client in a
later milestone is a drop-in change — no domain or use-case code moves.
