# domain

Pure business rules — the heart of the write side. No framework, no I/O, no `zod`, no Fastify.

M1 lands here: the **Show** aggregate (one show = one consistency boundary = one event stream),
its domain events (`SeatReserved`, `SeatReleased`, `SeatSold`, …), and the invariant that a seat
is **never sold twice** — enforced by folding the event stream and rejecting an illegal command
with a typed domain error. Everything here is unit-testable without a single mock.

Depends on nothing. If a file in this folder imports an adapter or a framework, that's a bug.
