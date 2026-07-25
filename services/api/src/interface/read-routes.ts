import { ShowId } from "@open-ticket/contracts";
import type { AvailabilityView, SeatMapView } from "@open-ticket/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { availabilityAsOf, seatMapAsOf } from "../application/index.ts";
import type { Clock, Projector } from "../application/index.ts";

/**
 * The read side over HTTP (interface layer, thin): pure reads off the projection. Each handler gets
 * the show's raw SeatMap from the projector, resolves effective status against the injected clock
 * (D2-04 lazy expiry — never `Date.now()`), and shapes a contract DTO with `asOf`. It imports only
 * application (projector + queries) and contracts (DTOs), never infrastructure. No business logic.
 */
export interface ReadDeps {
  readonly projector: Projector;
  readonly clock: Clock;
}

export function registerReadRoutes(server: FastifyInstance, deps: ReadDeps): void {
  server.get<{ Params: { showId: string } }>("/shows/:showId/seats", (request, reply) => {
    const guard = notReadable(deps, request, reply);
    if (guard) return guard;

    const { showId } = request.params;
    const view: SeatMapView = {
      showId: ShowId.parse(showId),
      asOf: deps.projector.asOf(),
      // getSeatMap is defined here — notReadable already 404'd an unseen show.
      seats: [
        ...seatMapAsOf(deps.projector.getSeatMap(showId) ?? { seats: new Map() }, deps.clock.now()),
      ],
    };
    return reply.status(200).send(view);
  });

  server.get<{ Params: { showId: string } }>("/shows/:showId", (request, reply) => {
    const guard = notReadable(deps, request, reply);
    if (guard) return guard;

    const { showId } = request.params;
    const counts = availabilityAsOf(
      deps.projector.getSeatMap(showId) ?? { seats: new Map() },
      deps.clock.now(),
    );
    const view: AvailabilityView = {
      showId: ShowId.parse(showId),
      asOf: deps.projector.asOf(),
      ...counts,
    };
    return reply.status(200).send(view);
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
