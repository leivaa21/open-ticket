# Decisions

## 2026-07-24 — Event sourcing + CQRS, not CRUD

**Context:** the domain is seat reservation under contention. State transitions (hold → confirm
→ release/expire) are inherently event-shaped, and the read side (thousands watching a seat map)
is wildly asymmetric to the write side (few actually buying).
**Decision:** model the write side as **event-sourced aggregates** and serve reads from
**separate projections** (CQRS). The event log is the source of truth; read models are
disposable, rebuildable views.
**Consequences:** more moving parts than CRUD — justified here, and the point of the showcase.
Guarded against over-engineering by keeping projections in-process (no message bus) until a
milestone genuinely needs otherwise.

## 2026-07-24 — Per-show aggregate: one show = one stream = one consistency boundary

**Context:** the invariant "a seat is never sold twice" needs a boundary within which decisions
are serialized. Options: one stream per show, per-section, or per-seat.
**Decision:** the **Show** is the aggregate; all of its seat events live on **one stream**.
Reservations for a show serialize through that stream via optimistic append.
**Rationale:** the invariant becomes trivially correct (one place decides), and the resulting
contention on hot shows is exactly what the load test is meant to exercise and the dashboard to
visualize — it's the feature, not a flaw. Finer-grained partitioning (per-section streams) is a
deliberate later scaling chapter (M4), not the M1 foundation.
**Consequences:** a very hot show funnels writes through one stream; optimistic-concurrency
retries under contention are expected and measured, not avoided.

## 2026-07-24 — Target store EventStoreDB; M1 in-memory adapter behind a port

**Context:** the write side needs append-to-stream with optimistic concurrency and per-stream
reads; M1 shouldn't require standing infrastructure to run or test.
**Decision:** define an `EventStore` **port** modelled on EventStoreDB semantics
(append-with-expected-revision, read-stream) and ship an **in-memory adapter** for M1. The real
EventStoreDB client is a later drop-in.
**Rationale:** EventStoreDB (chosen over Postgres) is purpose-built for event sourcing — real
category streams and catch-up subscriptions the projections will use in M2 — so the port stays
honest to production semantics. In-memory keeps M1 fast and infra-free (unit tests, no Docker).
**Consequences:** the in-memory adapter must faithfully reproduce expected-revision conflicts,
or M1 tests would pass against semantics the real store won't honor. That fidelity is itself
tested.

## 2026-07-24 — Live browser updates over SSE (M3)

**Context:** the seat map and dev dashboard need to reflect server state live; the browser only
consumes (it reserves via HTTP).
**Decision:** push updates with **Server-Sent Events**, not WebSockets or polling.
**Rationale:** one-way server→browser is exactly SSE's shape — simplest infra that still feels
live, auto-reconnect built in. WebSockets' bidirectionality buys nothing here.
**Consequences:** revisit only if a future feature needs the browser to push over the same
channel.
