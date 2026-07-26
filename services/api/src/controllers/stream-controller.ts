import type { FastifyInstance } from "fastify";

import {
  buildSeatMapView,
  type Projector,
} from "../contexts/ticketing/queries/application/index.ts";
import type { Broadcaster, Clock } from "../contexts/ticketing/shared/application/index.ts";
import { openSse } from "../middlewares/sse.ts";

/**
 * The two SSE feeds (D3-02). Each sends an initial snapshot on connect, then deltas as the
 * projector broadcasts (D3-03), with heartbeats and disconnect cleanup. Imports application
 * (projector/broadcaster/queries via views) + node stream only — never infrastructure.
 */
export interface SseDeps {
  readonly projector: Projector;
  readonly clock: Clock;
  readonly broadcaster: Broadcaster;
  /** Heartbeat interval; injectable so tests keep it short (default 15s in `openSse`). */
  readonly heartbeatMs?: number;
}

export function registerSseRoutes(server: FastifyInstance, deps: SseDeps): void {
  // Per-show seat map stream: initial SeatMapView, then a fresh one whenever this show advances.
  server.get<{ Params: { showId: string } }>("/shows/:showId/seats/stream", (request, reply) => {
    // Reject before upgrading to a stream — a dead projection or unseen show is a plain response.
    if (!deps.projector.isHealthy()) {
      return reply.status(503).send({ error: { type: "ProjectionUnavailable" } });
    }
    const { showId } = request.params;
    if (deps.projector.getSeatMap(showId) === undefined) {
      return reply.status(404).send({ error: { type: "NotFound" } });
    }

    const channel = openSse(request, reply, deps.heartbeatMs);
    channel.push({ event: "seatmap", data: buildSeatMapView(deps.projector, deps.clock, showId) });

    const unsubscribe = deps.broadcaster.onShowChanged(showId, () => {
      if (!deps.projector.isHealthy()) {
        channel.push({ event: "error", data: { type: "ProjectionUnavailable" } });
        channel.close();
        return;
      }
      channel.push({
        event: "seatmap",
        data: buildSeatMapView(deps.projector, deps.clock, showId),
      });
    });
    channel.onClose(unsubscribe);
    return reply;
  });

  // Dashboard stream: initial lag snapshot, then each appended event + the moving lag.
  server.get("/dev/stream", (request, reply) => {
    const channel = openSse(request, reply, deps.heartbeatMs);
    channel.push({ event: "lag", data: deps.projector.lagSnapshot() });

    const unsubAppended = deps.broadcaster.on("appended", (payload) => {
      channel.push({ event: "appended", data: payload });
    });
    const unsubLag = deps.broadcaster.on("lag", (payload) => {
      channel.push({ event: "lag", data: payload });
    });
    channel.onClose(() => {
      unsubAppended();
      unsubLag();
    });
    return reply;
  });
}
