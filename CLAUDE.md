# CLAUDE.md — open-ticket

> **What this repo is:** a seat-reservation / ticketing system built to make **CQRS + event
> sourcing visible** — hundreds of concurrent buyers race for the same seats, the system proves
> **zero double-selling** under load, and a dev dashboard shows commands arriving, events
> appending, and projections catching up on screen.
> Part of leivaa's public-projects workspace — the workspace `../CLAUDE.md` rules (quality,
> security, docs, git) apply here in full; this file only adds what's specific to this project.
> Read this file before every task and re-read the **Current state** line.

> **Current state (2026-07-25):** **M1 complete and merged — the event-sourced write side
> works.** Four PRs shipped through the implementer → reviewer loop: contracts (commands +
> events), the pure Show aggregate + no-double-sell invariant, the application layer + in-memory
> `EventStore` (optimistic-retry use cases), and the thin Fastify HTTP surface. 84 tests, audit
> clean. **Reality gate passed:** against the real running server, 20 genuinely concurrent
> reservations for one seat → exactly 1×201, 19×409 `SeatsUnavailable`, no double-sell, no 500.
> The store is in-memory behind an EventStoreDB-shaped port. **Next: M2 — projections + a read
> API** (`GET` seat map / availability), documenting the consistency boundary. Keep this line
> current after every merged slice.

## Identity

- **Registry index:** 2 (see `../PROJECTS.md`)
- **Ports:** api **5210**, web **5200** (web arrives in M3)
- **Repo:** github.com/leivaa21/open-ticket · **License:** MIT

## Architecture

```
apps/web (M3: Next.js — seat map + dev dashboard) ──HTTP/SSE──▶ services/api ──▶ event store
                                                                     │
   both import packages/contracts (commands · events · read-model DTOs, zod)
```

- **`services/api`** is **hexagonal + CQRS**, dependency-inward (never violate the direction):
  - `domain/` — pure aggregates + rules. The **Show** is the aggregate; **one show = one
    consistency boundary = one event stream**. No framework, no I/O, no zod. The invariant "a
    seat is never sold twice" is enforced here by folding the stream.
  - `application/` — use cases (`ReserveSeats`, `ConfirmPurchase`, `ReleaseHold`) orchestrating
    the domain through **ports** (`EventStore`, `Clock`, `IdGenerator`) declared here. Append is
    optimistic: expected revision, retry on conflict.
  - `infrastructure/` — adapters. M1 ships an in-memory `EventStore` mirroring **EventStoreDB**
    semantics (append-with-expected-revision + per-stream read), so the real client is a
    drop-in swap later.
  - `interface/` — thin Fastify layer: parse → call use case → map result to status. No
    business logic in a handler.
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
