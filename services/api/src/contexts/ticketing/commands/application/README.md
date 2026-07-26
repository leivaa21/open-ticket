# commands / application

The write side's use cases, orchestrating the domain through **ports** (interfaces declared here,
implemented in the context's `shared/infrastructure/`). A use case: load the aggregate's event
stream through an `EventStore` port, decide via the domain, append new events with an **expected
revision** (optimistic concurrency), and retry on conflict.

M1 lands the reservation use cases — `ReserveSeats` (a TTL hold), `ConfirmPurchase`,
`ReleaseHold` — plus the write ports they need (`EventStore`, `IdGenerator`). The shared `Clock`
port they also depend on lives in `shared/application` (both sides resolve time against it). Ports
are the only thing the domain-facing code knows; which adapter fulfils them is decided at the edge.
