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

## 2026-07-25 — Read side: async catch-up projections, eventually consistent

**Context:** M2 needs to serve a read-heavy domain (thousands watch a seat map, few buy). Options
were on-demand folds (re-read the stream per request), synchronous inline projections (always
fresh), or asynchronous catch-up projections (eventually consistent).
**Decision:** **async catch-up projections** — an in-process projector subscribes to a global
positioned `$all` log, replays history, then stays live, updating the in-memory read models (the
seat map and the availability summary). Reads hit the read model and may briefly lag; every read
exposes an `asOf` position.
**Rationale:** it's the authentic CQRS/ES shape, mirrors EventStoreDB's `$all` + catch-up
subscriptions (so the real client is a drop-in), and it's the **only** option where projection
lag is a real, observable quantity — the entire point of a project whose thesis is "watch eventual
consistency happen." On-demand folds don't scale with read fan-out; synchronous projections have
no lag to visualize.
**Consequences:** reads can be stale (bounded by projector lag); a not-yet-projected show reads
`404`. The read model is **time-aware for hold liveness** (stores each hold's `expiresAt`,
resolving held-vs-available against a clock) so it agrees with the domain's lazy expiry without an
M4 sweeper. Full rationale in [design/m2.md](design/m2.md).

## 2026-07-26 — M3: make it watchable — interactive seat map + dashboard over SSE

**Context:** M1/M2 built a correct, eventually-consistent CQRS system visible only through
`curl`. The project's thesis is that write contention, read/write asymmetry, and eventual
consistency become watchable; M3 delivers the on-screen proof.
**Decision:** an **interactive** Next.js seat map (click to reserve/confirm/release, driving the
real write API) plus a **full observational dev dashboard** (event feed + projection-lag meter),
both updated live over **SSE** from an in-process broadcaster fed by the projector. `apps/web` on
`:5200` reuses the contracts read DTOs; cross-origin is explicit CORS restricted to a configured
`WEB_ORIGIN` (never `*`). The UI gets a polished, distinctive visual pass — it is the portfolio's
visible face.
**Rationale:** interactivity makes the two-tab race demo (open two tabs, race one seat, watch one
win) the thing that sells the architecture; the dashboard makes projection lag a visible quantity.
SSE (not WebSockets) because the browser only consumes. The broadcaster keeps the "no message bus"
non-goal intact.
**Consequences:** the deliberate projector-throttle control and published load numbers stay M4 —
M3 proves the visualization, M4 stresses it. Full rationale in [design/m3.md](design/m3.md).

## 2026-07-26 — CQRS by folder: commands/queries as separate hexagons

**Context:** the API had grown a flat `domain/ application/ infrastructure/ interface/` layout.
For a project whose thesis _is_ CQRS, the command/query split was only conceptual — invisible in
the tree.
**Decision:** reorganize `services/api/src` so the split is **structural**: `app/` (composition
root, config, main), `controllers/` + `middlewares/` (the HTTP edge), and
`contexts/ticketing/{commands,queries}/{domain,application,…}` — each side its own
dependency-inward hexagon. Cross-side, in-process collaborators (the `Clock` port, the SSE
`Broadcaster`) live in `contexts/ticketing/shared/application/`; the adapters that touch the
outside (the in-memory `EventStore`/`EventLog`, the system clock + uuid generator) live in
`shared/infrastructure/`.
**Rationale:** the folder tree now _is_ the architecture diagram — a reader sees the write model
(aggregate, use cases, optimistic append) and the read model (projections, subscription,
seat-map) as separate bounded hexagons, which is exactly the story the project tells. Placing the
read-model store and the broadcaster in `application` (not `infrastructure`) keeps the arrows
inward: they're in-process, zero-external-I/O machinery, not ports-and-adapters "adapters".
**Consequences:** per-side `infrastructure/` folders are intentionally absent — at the in-memory
stage the only real infrastructure is the shared event store; they return at M4 when EventStoreDB
adapters (and a persistent read-model store) earn a repository/notifier **port**. The move was
behavior-preserving (no logic change; all 166 tests unchanged and green).
