/**
 * Shared application layer — in-process machinery both sides depend on, touching no external
 * system (so it is application, not infrastructure). The `Clock` port both the write use cases and
 * the read views resolve time against, the opaque `Position` both sides speak in (D4-01), and the
 * `Broadcaster` the projector feeds and the SSE controllers consume.
 */

export type { Clock } from "./clock.ts";
export { IncomparablePositionsError, isAtOrAfter, positionsEqual, tokenOf } from "./position.ts";
export type { Position } from "./position.ts";
export { Broadcaster } from "./broadcaster.ts";
export type { BroadcastEvents, BroadcastType, LagSnapshot } from "./broadcaster.ts";
