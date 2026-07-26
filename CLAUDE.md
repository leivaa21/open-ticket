# CLAUDE.md — open-ticket

> **What this repo is:** a seat-reservation / ticketing system built to make **CQRS + event
> sourcing visible** — hundreds of concurrent buyers race for the same seats, the system proves
> **zero double-selling** under load, and a dev dashboard shows commands arriving, events
> appending, and projections catching up on screen.
> Part of leivaa's public-projects workspace — the workspace `../CLAUDE.md` rules (quality,
> security, docs, git) apply here in full; this file only adds what's specific to this project.
> Read this file before every task and re-read the **Current state** line.

> **Current state (2026-07-26):** **M1–M3 complete and merged — the CQRS system is live and
> watchable.** M1: event-sourced write side (Show aggregate + no-double-sell invariant,
> optimistic-retry use cases, thin HTTP). M2: async read side — positioned `$all` log + catch-up
> subscription, a seat-map + availability **projection**, `GET` endpoints served
> **eventually-consistent** with `asOf` + read-your-writes (time-aware reads, 503 on a dead
> projection). M3: the **visible layer** — SSE feeds from an in-process broadcaster, a **Next.js**
> app (`apps/web`, `:5200`) with an **interactive seat map** (click to reserve, live over SSE) and
> a **dev dashboard** (`/dev`: event feed + projection-lag meter), origin-restricted CORS. 166
> tests (114 api + 29 contracts + 23 web), audit clean, all through the implementer → reviewer
> loop. **Reality gates passed:** 20 concurrent reservations for one seat → exactly one wins; the
> read side flips available → held → sold as the projection catches up; and two SSE "tabs" both
> see a raced seat go held live while the dashboard streams events + lag. Store in-memory behind
> EventStoreDB-shaped ports. **Next: M4 — deliberate projector-throttle + published load numbers
> (via `stampede`) + the real EventStoreDB adapter.** Keep this line current after every merged
> slice.

## Identity

- **Registry index:** 2 (see `../PROJECTS.md`)
- **Ports:** api **5210**, web **5200** (web arrives in M3)
- **Repo:** github.com/leivaa21/open-ticket · **License:** MIT

## Architecture

```
apps/web (Next.js — seat map + dev dashboard) ──HTTP/SSE──▶ services/api ──▶ event store
                                                                 │
   both import packages/contracts (commands · events · read-model DTOs, zod)
```

- **`services/api` is CQRS-by-folder** — the command/query split is structural, and each side is
  its own dependency-inward hexagon. Layout (`src/`):
  - `app/` — the composition root: `main`, `config`, `composition-root` (wires real adapters),
    `test-server`.
  - `controllers/` — thin Fastify route handlers (reservation commands, seat-map queries, SSE
    streams); `middlewares/` — error→status mapper, CORS, SSE framing.
  - `contexts/ticketing/` — the one bounded context:
    - `commands/domain/` — the pure **Show** aggregate; **one show = one consistency boundary =
      one event stream**; the "never sold twice" invariant is enforced here by folding the
      stream. No framework, no I/O, no zod.
    - `commands/application/` — use cases (`ReserveSeats`/`ConfirmPurchase`/`ReleaseHold`) through
      ports (`EventStore`, `IdGenerator`) declared here; optimistic append, retry on conflict.
    - `queries/domain/` — the seat-map read model (a pure reducer) + time-aware read logic.
    - `queries/application/` — the `EventLog` port, the catch-up `subscription`, the `Projector`,
      the in-memory read-model store, and the read-DTO view builders.
    - `shared/application/` — the cross-side `Clock` port + the SSE `Broadcaster` (in-process, no
      external I/O). `shared/infrastructure/` — the adapters that touch the outside: the in-memory
      `EventStore`/`EventLog` (mirroring **EventStoreDB**, a drop-in swap later) and the system
      clock / uuid generator.
  - **Dependency rule (never violate):** domain imports only `@open-ticket/contracts`; application
    depends on ports; infrastructure implements them; only `app/composition-root` imports concrete
    adapters. Per-side `infrastructure/` folders don't exist yet — at the in-memory stage the only
    real infrastructure is shared; they return at M4 with EventStoreDB adapters.
- **Contracts don't fork.** A command/event/DTO shape lives once in `packages/contracts`
  (zod schema → inferred type); the API validates inbound with it, the app trusts the type.

## Decisions locked at kickoff (see `docs/decisions.md` for rationale)

- **Event sourcing + CQRS**, not CRUD — the read/write asymmetry (thousands watch, few buy)
  earns it. Target production store: **EventStoreDB**; M1 uses an in-memory port-compatible
  adapter.
- **Per-show aggregate / one stream per show** — the consistency boundary that makes the
  no-double-sell invariant trivially correct; hot-show contention is the showcase, not a bug.
- **Live updates over SSE** (one-way push to the seat map + dashboard) — added in M3.
- **Optimistic concurrency** on append (expected revision) — the concurrency story is visible
  and real.

## Commands

```bash
pnpm install
pnpm dev          # turbo: api on :5210 (web joins at M3)
pnpm test         # unit + integration across the workspace
pnpm lint && pnpm typecheck && pnpm build
pnpm audit        # must stay clean (overrides in pnpm-workspace.yaml)
```

## Non-goals

No real payments (faked behind a port), no multi-tenant SaaS, no user accounts beyond the
minimum for a demo, no Kafka/RabbitMQ (in-process event handling first). Simplicity is the
feature; the domain is the showcase. Say no on purpose.
