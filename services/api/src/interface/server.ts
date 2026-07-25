import Fastify, { type FastifyInstance } from "fastify";

import { ConfirmPurchase, ReleaseHold, ReserveSeats, ScheduleShow } from "@open-ticket/contracts";
import type { ShowId } from "@open-ticket/contracts";

import { confirmPurchase, releaseHold, reserveSeats, scheduleShow } from "../application/index.ts";
import type { Clock, Projector, UseCaseDeps } from "../application/index.ts";

import {
  bodyRecord,
  registerErrorHandlers,
  sendRejection,
  sendValidationError,
} from "./http-result.ts";
import { registerReadRoutes } from "./read-routes.ts";

/**
 * The thin HTTP surface (interface layer): each handler builds a command from route params + body,
 * parses it against the contract schema at the edge (never trust the client), calls the use case,
 * and maps the typed result to a status. No business logic lives here. The read routes (registered
 * separately) query the projection; `/health` reports the projection's liveness.
 */
export interface ServerDeps {
  readonly useCases: UseCaseDeps;
  /** Mints a fresh show id on POST /shows (server-generated so clients can't collide). */
  readonly generateShowId: () => ShowId;
  /** The catch-up projection the read routes serve; `/health` reflects its liveness. */
  readonly projector: Projector;
  /** Read-side time source (D2-04) — the same instance the write side uses. */
  readonly clock: Clock;
  readonly logger?: boolean;
}

// A show's inventory can be large; a single reservation is a handful of ids. Cap both so an
// oversized body can never OOM the process, tightening the hot reservation routes further.
const INVENTORY_BODY_LIMIT = 256 * 1024;
const RESERVATION_BODY_LIMIT = 16 * 1024;
/** A single hold over this many seats is abuse/error — rejected before the domain (422). */
const MAX_SEATS_PER_RESERVATION = 100;

export function buildServer(deps: ServerDeps): FastifyInstance {
  const server = Fastify({ logger: deps.logger ?? false, bodyLimit: INVENTORY_BODY_LIMIT });
  registerErrorHandlers(server);

  // Liveness distinguishes "process up" from "projection dead": a crashed projection returns 503 so
  // a readiness probe fails and the read routes are known-degraded, not silently serving stale data.
  server.get("/health", (_request, reply) => {
    const healthy = deps.projector.isHealthy();
    return reply
      .status(healthy ? 200 : 503)
      .send({ status: healthy ? "ok" : "degraded", projection: healthy ? "healthy" : "unhealthy" });
  });

  registerReadRoutes(server, { projector: deps.projector, clock: deps.clock });

  // POST /shows — schedule a show; server generates and returns its id (201 Created).
  server.post<{ Body: unknown }>("/shows", async (request, reply) => {
    const parsed = ScheduleShow.safeParse({
      ...bodyRecord(request.body),
      type: "ScheduleShow",
      showId: deps.generateShowId(),
    });
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const result = await scheduleShow(deps.useCases, parsed.data);
    return result.ok
      ? reply
          .status(201)
          .send({ showId: parsed.data.showId, commitPosition: result.value.commitPosition })
      : sendRejection(reply, result.error);
  });

  // POST /shows/:showId/reservations — hold seats; returns the allocated holdId (201).
  server.post<{ Params: { showId: string }; Body: unknown }>(
    "/shows/:showId/reservations",
    { bodyLimit: RESERVATION_BODY_LIMIT },
    async (request, reply) => {
      const parsed = ReserveSeats.safeParse({
        ...bodyRecord(request.body),
        type: "ReserveSeats",
        showId: request.params.showId,
      });
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      if (parsed.data.seatIds.length > MAX_SEATS_PER_RESERVATION) {
        return reply
          .status(422)
          .send({ error: { type: "TooManySeats", limit: MAX_SEATS_PER_RESERVATION } });
      }

      const result = await reserveSeats(deps.useCases, parsed.data);
      return result.ok
        ? reply
            .status(201)
            .send({ holdId: result.value.holdId, commitPosition: result.value.commitPosition })
        : sendRejection(reply, result.error);
    },
  );

  // POST /shows/:showId/reservations/:holdId/confirmation — turn a live hold into a sale.
  server.post<{ Params: { showId: string; holdId: string } }>(
    "/shows/:showId/reservations/:holdId/confirmation",
    { bodyLimit: RESERVATION_BODY_LIMIT },
    async (request, reply) => {
      const parsed = ConfirmPurchase.safeParse({
        type: "ConfirmPurchase",
        showId: request.params.showId,
        holdId: request.params.holdId,
      });
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const result = await confirmPurchase(deps.useCases, parsed.data);
      return result.ok
        ? reply
            .status(200)
            .send({ status: "confirmed", commitPosition: result.value.commitPosition })
        : sendRejection(reply, result.error);
    },
  );

  // DELETE /shows/:showId/reservations/:holdId — release a live hold, freeing its seats.
  server.delete<{ Params: { showId: string; holdId: string } }>(
    "/shows/:showId/reservations/:holdId",
    async (request, reply) => {
      const parsed = ReleaseHold.safeParse({
        type: "ReleaseHold",
        showId: request.params.showId,
        holdId: request.params.holdId,
      });
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const result = await releaseHold(deps.useCases, parsed.data);
      return result.ok
        ? reply
            .status(200)
            .send({ status: "released", commitPosition: result.value.commitPosition })
        : sendRejection(reply, result.error);
    },
  );

  return server;
}
