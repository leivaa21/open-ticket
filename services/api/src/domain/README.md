# domain

Pure business rules — the heart of the write side. No framework, no I/O, no `zod` runtime, no
`Date.now()`, no `crypto`. Imports only types from `@open-ticket/contracts`.

The **Show** aggregate (one show = one consistency boundary = one event stream) is a pure fold:

- `evolve(state, event) → state` folds an event fact into the aggregate state (exhaustive over
  the five facts: `ShowScheduled`, `SeatsHeld`, `HoldReleased`, `HoldExpired`, `SeatsSold`).
  State is **time-free** — it records each hold's `expiresAt` and status but never judges expiry.
- `decide(state, command, ctx) → events | DomainError` decides a command against current state,
  returning the facts to append or a typed error (returned, never thrown). Effective hold
  liveness (`status === "live" && expiresAt > ctx.now`) is computed here, where the clock lives —
  which is what makes **lazy expiry** fall out: a time-expired hold frees its seats with no event.

The invariant — **a seat is never sold twice, nor held by two live holds** — is enforced here and
proven by adversarial tests (`invariant.test.ts`). `decide` stays pure: the current time and a
pre-allocated `{holdId, expiresAt}` arrive via `ctx` (the seam the application layer fills from
its `Clock`/`IdGenerator` ports), so nothing here reads a clock or generates an id.

Depends on nothing but contracts types. If a file in this folder imports an adapter or a
framework, that's a bug.
