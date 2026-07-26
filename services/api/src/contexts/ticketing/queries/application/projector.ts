import type { DomainEventFact } from "@open-ticket/contracts";

import type { Broadcaster, LagSnapshot } from "../../shared/application/index.ts";
import { applySeatMap, emptySeatMap } from "../domain/seat-map.ts";
import type { SeatMapState } from "../domain/seat-map.ts";
import type { EventLog, GlobalEvent, GlobalPosition } from "./event-log.ts";
import { ReadModelStore } from "./read-model-store.ts";
import { subscribe } from "./subscription.ts";
import type { Scheduler, Subscription } from "./subscription.ts";

type SeatMapReducer = (state: SeatMapState, event: DomainEventFact) => SeatMapState;

export interface ProjectorDeps {
  readonly log: EventLog;
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
  private readonly store: ReadModelStore;
  private readonly reduce: SeatMapReducer;
  private readonly broadcaster: Broadcaster | undefined;
  private readonly subscription: Subscription;

  constructor(deps: ProjectorDeps) {
    this.log = deps.log;
    this.store = deps.store ?? new ReadModelStore();
    this.reduce = deps.reducer ?? applySeatMap;
    this.broadcaster = deps.broadcaster;
    this.subscription = subscribe({
      log: deps.log,
      from: 0,
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
    this.store.advanceAsOf(event.globalPosition);
    this.broadcast(event);
  }

  /** D3-03: notify SSE subscribers of the applied event + the fresh lag snapshot (a no-op if unwired). */
  private broadcast(event: GlobalEvent): void {
    if (this.broadcaster === undefined) return;
    this.broadcaster.emit("seatChanged", { showId: event.streamId });
    this.broadcaster.emit("appended", {
      position: event.globalPosition,
      type: event.type,
      showId: event.streamId,
    });
    this.broadcaster.emit("lag", this.lagSnapshot());
  }

  /** The show's raw SeatMap state, or `undefined` if the projector hasn't seen it yet (PR3 → 404). */
  getSeatMap(showId: string): SeatMapState | undefined {
    return this.store.getShow(showId);
  }

  /** The global position the projection reflects (D2-05). */
  asOf(): GlobalPosition {
    return this.store.asOf;
  }

  /** How far the projection trails the log right now. */
  lag(): Promise<number> {
    return this.subscription.lag();
  }

  /** A synchronous, consistent lag snapshot (D3-02 dashboard): head, asOf, and how far behind. */
  lagSnapshot(): LagSnapshot {
    const asOf = this.store.asOf;
    const head = this.log.head();
    return { head, asOf, behind: Math.max(0, head - (asOf + 1)) };
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
