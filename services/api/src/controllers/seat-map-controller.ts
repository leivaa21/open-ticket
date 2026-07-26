import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Clock } from "../contexts/ticketing/shared/application/index.ts";
import {
  buildAvailabilityView,
  buildSeatMapView,
  type Projector,
} from "../contexts/ticketing/queries/application/index.ts";

/**
 * The read side over HTTP (thin controller): pure reads off the projection, plus `/health`. Each
 * seat/availability handler gets the show's raw SeatMap from the projector, resolves effective
 * status against the injected clock (D2-04 lazy expiry — never `Date.now()`), and shapes a contract
 * DTO with `asOf` via the shared view builders. Imports only application + contracts, never
 * infrastructure. No business logic.
 */
export interface ReadDeps {
  readonly projector: Projector;
  readonly clock: Clock;
}

export function registerReadRoutes(server: FastifyInstance, deps: ReadDeps): void {
  // Liveness distinguishes "process up" from "projection dead": a crashed projection returns 503 so
  // a readiness probe fails and the read routes are known-degraded, not silently serving stale data.
  server.get("/health", (_request, reply) => {
    const healthy = deps.projector.isHealthy();
    return reply
      .status(healthy ? 200 : 503)
      .send({ status: healthy ? "ok" : "degraded", projection: healthy ? "healthy" : "unhealthy" });
  });

  server.get<{ Params: { showId: string } }>("/shows/:showId/seats", (request, reply) => {
    const guard = notReadable(deps, request, reply);
    if (guard) return guard;
    return reply
      .status(200)
      .send(buildSeatMapView(deps.projector, deps.clock, request.params.showId));
  });

  server.get<{ Params: { showId: string } }>("/shows/:showId", (request, reply) => {
    const guard = notReadable(deps, request, reply);
    if (guard) return guard;
    return reply
      .status(200)
      .send(buildAvailabilityView(deps.projector, deps.clock, request.params.showId));
  });
}

/**
 * The shared read guard: 503 if the projection is dead (never serve stale as if live — reviewer
 * nit 4), 404 if the show has not been projected yet (D2-05: "not visible yet"). Returns the sent
 * reply when it handled the request, or `undefined` to let the handler proceed.
 */
function notReadable(
  deps: ReadDeps,
  request: FastifyRequest<{ Params: { showId: string } }>,
  reply: FastifyReply,
): FastifyReply | undefined {
  if (!deps.projector.isHealthy()) {
    request.log.error({ err: deps.projector.lastError() }, "projection unavailable");
    return reply.status(503).send({ error: { type: "ProjectionUnavailable" } });
  }
  if (deps.projector.getSeatMap(request.params.showId) === undefined) {
    return reply.status(404).send({ error: { type: "NotFound" } });
  }
  return undefined;
}
