import type { EpochMillis } from "@open-ticket/contracts";

/**
 * Time as a port (D1-03) — deterministic in tests, `Date.now()`-backed in production. Shared by
 * both sides of the context: the write use cases judge hold liveness against it and the read views
 * resolve lazy expiry against it, so it lives in `shared/application` rather than either side.
 */
export interface Clock {
  now(): EpochMillis;
}
