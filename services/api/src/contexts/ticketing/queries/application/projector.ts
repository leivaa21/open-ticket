import type { DomainEventFact } from "@open-ticket/contracts";

import { isAtOrAfter } from "../../shared/application/index.ts";
import type { Broadcaster, Clock, LagSnapshot, Position } from "../../shared/application/index.ts";
import { applySeatMap, emptySeatMap } from "../domain/seat-map.ts";
import type { SeatMapState } from "../domain/seat-map.ts";
import type { EventLog, GlobalEvent } from "./event-log.ts";
import { ReadModelStore } from "./read-model-store.ts";
import { subscribe } from "./subscription.ts";
import type { Scheduler, Subscription } from "./subscription.ts";

type SeatMapReducer = (state: SeatMapState, event: DomainEventFact) => SeatMapState;

export interface ProjectorDeps {
  readonly log: EventLog;
  /** Time source for `behindMs` (D4-01) — a port, never `Date.now()`, so lag is testable. */
  readonly clock: Clock;
  readonly store?: ReadModelStore;
  readonly scheduler?: Scheduler;
  /** The reducer to apply — defaults to `applySeatMap`; injectable so tests can force a failure. */
  readonly reducer?: SeatMapReducer;
  /** Optional (D3-03): when present, each applied event is broadcast for SSE. Absent → no-op. */
  readonly broadcaster?: Broadcaster;
}

/**
 * Wires the SeatMap reducer to a catch-up subscription (D2-01). On construction it subscribes from
 * position 0 — replaying history then staying live — routing each event to its show by `streamId`,
 * applying the reducer, and advancing `asOf`. A reducer/handler throw stops the subscription; the
 * failure is surfaced through `isHealthy()`/`lastError()` (PR1's `failed()` was pull-only) so a dead
 * projection can be detected rather than silently serving stale reads.
 */
export class Projector {
  private readonly log: EventLog;
  private readonly clock: Clock;
  private readonly store: ReadModelStore;
  private readonly reduce: SeatMapReducer;
  private readonly broadcaster: Broadcaster | undefined;
  private readonly subscription: Subscription;
  /**
   * When this projector started. It is the honest floor for `behindMs` before the first event is
   * applied: with nothing applied there is no `recordedAt` to measure from, but the read model has
   * been empty — and therefore stale — for exactly this long. Reporting 0 there would claim
   * "caught up" while the log holds events nobody has projected.
   */
  private readonly startedAt: number;

  constructor(deps: ProjectorDeps) {
    this.log = deps.log;
    this.clock = deps.clock;
    this.store = deps.store ?? new ReadModelStore();
    this.reduce = deps.reducer ?? applySeatMap;
    this.broadcaster = deps.broadcaster;
    this.startedAt = deps.clock.now();
    this.subscription = subscribe({
      log: deps.log,
      from: null,
      handler: (event) => {
        this.project(event);
      },
      // Omit `scheduler` when unset (exactOptionalPropertyTypes) so the default microtask one is used.
      ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
    });
  }

  private project(event: GlobalEvent): void {
    const showId = event.streamId;
    const previous = this.store.getShow(showId) ?? emptySeatMap;
    // If the reducer throws, we advance neither the show nor `asOf` nor broadcast — the
    // subscription stops here (the broadcast happens only after a successful apply).
    this.store.setShow(showId, this.reduce(previous, event));
    this.store.advanceApplied(event.position, event.recordedAt);
    this.broadcast(event);
  }

  /** D3-03: notify SSE subscribers of the applied event + the fresh lag snapshot (a no-op if unwired). */
  private broadcast(event: GlobalEvent): void {
    if (this.broadcaster === undefined) return;
    this.broadcaster.emit("seatChanged", { showId: event.streamId });
    this.broadcaster.emit("appended", {
      position: event.position.token,
      type: event.type,
      showId: event.streamId,
    });
    this.broadcaster.emit("lag", this.lagSnapshot());
  }

  /** The show's raw SeatMap state, or `undefined` if the projector hasn't seen it yet (PR3 → 404). */
  getSeatMap(showId: string): SeatMapState | undefined {
    return this.store.getShow(showId);
  }

  /** The global position the projection reflects (D2-05), or `null` before the first event. */
  asOf(): Position | null {
    return this.store.asOf;
  }

  /**
   * A synchronous, consistent lag snapshot for the dashboard (D3-02), in **time** (D4-01).
   *
   * `behindMs` is how stale the read model's data is: `now − recordedAt` of the last applied
   * event, and exactly `0` when the projection has reached the head. `behindEvents` rides along
   * only when the adapter can produce it for nothing (the in-memory log can; EventStoreDB cannot),
   * which is why it is optional on the port and omitted — never zeroed — when absent.
   */
  lagSnapshot(): LagSnapshot {
    const head = this.log.head();
    const asOf = this.store.asOf;
    if (head === null || isAtOrAfter(asOf, head)) return { behindMs: 0, behindEvents: 0 };

    const recordedAt = this.store.asOfRecordedAt;
    const since = recordedAt ?? this.startedAt;
    const behindMs = Math.max(0, this.clock.now() - since);
    const behindEvents = this.log.behindEvents?.(asOf);
    // Omit rather than zero when the store cannot count (exactOptionalPropertyTypes).
    return behindEvents === undefined ? { behindMs } : { behindMs, behindEvents };
  }

  /** False once a reducer threw — the read side must not serve as if live. */
  isHealthy(): boolean {
    return this.subscription.failed() === undefined;
  }

  lastError(): unknown {
    return this.subscription.failed();
  }

  /** Resolves when the projector is idle — the test drain seam. */
  settled(): Promise<void> {
    return this.subscription.settled();
  }

  stop(): void {
    this.subscription.stop();
  }
}
