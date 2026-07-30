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

## 2026-07-30 — Global positions become opaque tokens; projection lag becomes time-based

**Context:** the `EventLog` port defines `GlobalPosition` as a **contiguous 0-based counter** whose
`head` is literally the event count — a shape the in-memory adapter made feel natural. EventStoreDB's
`$all` positions are **commit/prepare byte offsets**: monotonic and totally ordered, but not
contiguous, not counts, and not cheaply convertible into "how many events behind". A faithful
adapter cannot implement the port as written.
**Decision:** a position becomes an **opaque token supporting comparison and equality only**
(serialized as a string in the read DTOs), and **projection lag is reported as `behindMs`** — now
minus the recorded timestamp of the last applied event, `0` when caught up. `behindEvents` survives
as an optional field, populated only by adapters that get it for free.
**Rationale:** read-your-writes (`asOf >= commitPosition`, D2-05) only ever needed a total order, not
arithmetic — so the correctness story is untouched while the port stops promising something a real
store can't deliver. Time-based lag means the same thing to every adapter and to a human, and it's
what production observability actually reports. The alternatives were worse: an adapter-maintained
counter breaks across restarts and instances (a correctness lie in the one place this project claims
rigor), and reporting bytes for one adapter and events for another gives the dashboard a unit that
depends on configuration.
**Consequences:** a breaking change to the read DTOs and the lag meter, taken deliberately **before**
the adapter lands so the adapter has an implementable port. The in-memory adapter keeps its counter
internally — it just stops being part of the contract. Full rationale in [design/m4.md](design/m4.md).

## 2026-07-30 — M4: drive eventual consistency on screen, and make the port swap real

**Context:** M3 made the system watchable but not steerable — an in-memory projector catches up
instantly, so the lag meter mostly reads zero and eventual consistency stays theoretical on screen.
Meanwhile "EventStoreDB-shaped ports" (2026-07-24) had never been tested against EventStoreDB.
**Decision:** ship both in M4. A **projector control panel** — per-event pacing through an awaited
`pace()` hook, pause/resume, and a background **rebuild that swaps atomically** so reads never go
down — behind an env flag (`DEV_CONTROLS_ENABLED`, default off, routes unregistered when off). And
the **real EventStoreDB adapter**, selected by `EVENT_STORE`, with **one port conformance suite run
against both adapters** and container-backed integration tests in CI.
**Rationale:** the two halves check each other — the panel is how you _see_ a real store's projection
lag, and the real store is what makes the lag worth seeing. Per-event pacing (not per-batch, which
the existing `Scheduler` seam would give) makes lag climb and drain visibly instead of sawtoothing.
The conformance suite, not the adapter, is the artifact: it's the only thing that proves the swap was
ever real. Dev controls default off because they are unauthenticated endpoints that can stall the
read side, in a public repo whose demo someone will deploy.
**Consequences:** Docker enters the test story (a separate `test:integration` suite keeps `pnpm test`
infra-free); the new client dependency and network surface get a security-auditor pass before merge.
Persisted read models stay deferred — a durable log plus rebuild-on-boot already covers restart, and
a second piece of infrastructure would cost the quickstart more than it buys. **Published load
numbers move to M5**: numbers measured against an in-memory store would be invalidated by this very
milestone, so they get measured once, on the real store, with `stampede` — whose contract is
specified from open-ticket's side in [design/m4.md](design/m4.md). Full rationale there.
