# ticketing context

The one bounded context of the API, organised **CQRS-by-folder** so the read/write asymmetry the
system exists to showcase is visible in the tree itself:

```
commands/    write side — decide & append
  domain/          the Show aggregate: pure rules, the no-double-sell invariant (evolve/decide)
  application/     reservation use cases + the write ports they orchestrate (EventStore, IdGenerator)
queries/     read side — subscribe & project
  domain/          the read model: the SeatMap reducer + time-aware queries (lazy expiry)
  application/     the $all EventLog port, the catch-up subscription, the Projector + its in-memory
                   read-model store, the view builders
shared/
  application/     in-process machinery both sides use, touching no external system: the Clock port
                   and the SSE broadcaster
  infrastructure/  adapters both sides use: the event store (EventStore + EventLog in one) and the
                   system Clock/IdGenerator adapters
```

Dependency direction stays inward: `domain` knows only `@open-ticket/contracts`; `application`
declares ports and depends on its domain; `infrastructure` implements ports and depends on
application. In-process collaborators that touch no external system — the shared `Clock` port and
the broadcaster — are application, not infrastructure, so both sides import them without an
outward or cross-side edge. The **write side** appends to a per-show stream; the **read side**
subscribes to the global `$all` log, folds each event into the SeatMap projection, and serves
eventually-consistent reads with an `asOf` position. One `shared/infrastructure` event store backs
both — a single append lands in a stream (for the writer's optimistic-concurrency check) and in
the `$all` log (for the projector) atomically.

The HTTP surface lives outside the context, in `../../controllers`, `../../middlewares`, and
`../../app` (composition root) — thin transport that parses at the edge and calls the use cases.
