import type { DevAppended, DevLag } from "@open-ticket/contracts";

/**
 * An in-process typed broadcaster (D3-03) bridging the projector to SSE subscribers. When the
 * projector applies an event it emits here; SSE handlers subscribe and forward, unsubscribing on
 * disconnect. No message bus — a plain typed emitter (consistent with the "no Kafka/RabbitMQ"
 * non-goal). It lives in the application layer: the projector feeds it, the interface consumes it.
 *
 * The `appended`/`lag` payloads ARE the `/dev/stream` wire DTOs, so they reuse the contracts
 * `DevAppended`/`DevLag` shapes — the API and the web dashboard share one definition (no fork).
 */

/** How far the projection trails the write head, in time (D4-01) — the dashboard lag meter. */
export type LagSnapshot = DevLag;

export interface BroadcastEvents {
  /** A specific show's projection advanced — its seat map should be re-pushed. */
  readonly seatChanged: { readonly showId: string };
  /** A new `$all` event was applied (the dashboard's per-event frame). */
  readonly appended: DevAppended;
  /** The projection lag moved (the dashboard's lag frame). */
  readonly lag: DevLag;
}

export type BroadcastType = keyof BroadcastEvents;
type Listener<K extends BroadcastType> = (payload: BroadcastEvents[K]) => void;

export class Broadcaster {
  private readonly listeners: { [K in BroadcastType]: Set<Listener<K>> } = {
    seatChanged: new Set(),
    appended: new Set(),
    lag: new Set(),
  };

  on<K extends BroadcastType>(type: K, listener: Listener<K>): () => void {
    const set = this.listeners[type];
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit<K extends BroadcastType>(type: K, payload: BroadcastEvents[K]): void {
    // Isolated and contained: the projector emits here in its critical path, and subscribers are
    // external I/O sinks (SSE clients). A flaky subscriber must not throw back into the projector
    // (killing the read side), starve its peers, or — unlike the store's internal pump — crash the
    // server. A subscriber fault is its own concern; the SSE layer tears down its own dead sockets.
    for (const listener of this.listeners[type]) {
      try {
        listener(payload);
      } catch {
        // contained on purpose — see above
      }
    }
  }

  /** Per-show routing: only fires for changes to `showId`, so a show-A signal ignores a show-B listener. */
  onShowChanged(showId: string, listener: () => void): () => void {
    return this.on("seatChanged", (payload) => {
      if (payload.showId === showId) listener();
    });
  }

  /** Test/observability hook: how many listeners are attached (used to assert disconnect cleanup). */
  listenerCount(type: BroadcastType): number {
    return this.listeners[type].size;
  }
}
