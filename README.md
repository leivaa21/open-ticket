# open-ticket

A seat-reservation system built to make **CQRS + event sourcing visible**. Hundreds of buyers
race for the same seats; open-ticket proves **zero double-selling** under load — and shows _how_
on screen: a live seat map plus a dev dashboard where commands arrive, events append, and
projections catch up in real time.

> **Status: M1–M3 complete — the whole thing is live and watchable.** The event-sourced API
> (`:5210`) has a write side with a proven no-double-sell invariant under concurrency and an
> eventually-consistent read side (a seat-map projection fed by a catch-up subscription, served
> over `GET` with an `asOf` marker and read-your-writes). A **Next.js web app** (`:5200`) makes
> it visible: an **interactive seat map** you click to reserve — updating live over SSE — and a
> **dev dashboard** (`/dev`) where the event log streams in and a projection-lag meter shows the
> read side catching up. Load numbers + the real EventStoreDB adapter land in M4.

## Why it exists

Most portfolio projects show CRUD. This one shows the hard part: **write contention** (many
buyers, one seat), **read/write asymmetry** (thousands watch the seat map, few buy), and
**eventual consistency you can watch happen**. The patterns — DDD, hexagonal, CQRS, event
sourcing — are here because the domain genuinely needs them, not for decoration.

## Quickstart

```bash
git clone git@github.com:leivaa21/open-ticket.git
cd open-ticket
pnpm install
pnpm dev            # api on :5210 + web on :5200 (turbo runs both)
```

Requires Node ≥ 24 and pnpm ≥ 11. Then open **http://localhost:5200** — create a show, click
seats to reserve them, and watch **http://localhost:5200/dev** stream the event log + projection
lag live. Open the seat map in two tabs and race for the same seat: exactly one wins, both
converge — no double-sell, on screen.

### Try the reservation flow

```bash
# Schedule a show → 201 with a server-generated id
curl -sX POST localhost:5210/shows -H 'content-type: application/json' \
  -d '{"seatIds":["A1","A2"]}'                      # {"showId":"…"}

# Hold seat A1 → 201 with a hold id
curl -sX POST localhost:5210/shows/$SHOW/reservations -H 'content-type: application/json' \
  -d '{"seatIds":["A1"],"holderId":"buyer-1"}'      # {"holdId":"…"}

# A second buyer racing for A1 → 409, never a double-sell
curl -sX POST localhost:5210/shows/$SHOW/reservations -H 'content-type: application/json' \
  -d '{"seatIds":["A1"],"holderId":"buyer-2"}'      # {"error":{"type":"SeatsUnavailable","seatIds":["A1"]}}

# Read the seat map — served from a projection, eventually consistent
curl -s localhost:5210/shows/$SHOW/seats            # {"asOf":1,"seats":[{"seatId":"A1","status":"held"},…]}
```

Fire 20 of that second call concurrently and exactly one wins — verified against the running
server, not just in tests. The write returns a `commitPosition`; the read exposes `asOf` — once
`asOf >= commitPosition`, your write is visible (read-your-writes across the CQRS boundary).

## Architecture

```
apps/web (:5200)  ──HTTP / SSE──▶  services/api (:5210)  ──▶  event store (in-memory → EventStoreDB)
   Next.js: seat map                 hexagonal + CQRS
   + dev dashboard                   domain · application · infrastructure · interface
                      both import packages/contracts (commands · events · DTOs, zod)
```

- **`services/api`** — hexagonal, dependency-inward. The **Show** is the aggregate (one show =
  one event stream = one consistency boundary); the "a seat is never sold twice" invariant is
  enforced in the pure domain by folding the event stream. Use cases append events with an
  **expected revision** (optimistic concurrency); the in-memory event store mirrors
  EventStoreDB so the real client swaps in cleanly.
- **`packages/contracts`** — commands, events, and read-model DTOs as zod schemas (one source
  of truth; the API validates, the app trusts the types).

## Decisions

- **Event sourcing + CQRS over CRUD** — justified by the domain's read/write asymmetry and
  contention, not imposed. ([docs/decisions.md](docs/decisions.md))
- **Per-show aggregate** — the consistency boundary that makes no-double-sell trivially correct
  and makes hot-show contention the thing the load test showcases.
- **EventStoreDB** as the target store; **SSE** for live browser updates; **optimistic
  concurrency** on append.

## Roadmap

- [x] Scaffold — monorepo, API skeleton, `/health`, CI-green
- [x] **M1** — Show aggregate + reservation write side (in-memory store), invariant proven under concurrency
- [x] **M2** — async catch-up projections + `GET` read API, eventually consistent with `asOf` / read-your-writes
- [x] **M3** — interactive web seat map + the visible dev dashboard, live over SSE
- [ ] **M4** — load hardening: published numbers, deliberate-lag demo, real EventStoreDB

---

MIT © Adrián Leiva ([leivaa21](https://github.com/leivaa21)) · part of
[whos.leivaa.dev](https://whos.leivaa.dev)
