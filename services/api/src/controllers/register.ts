import Fastify, { type FastifyInstance } from "fastify";

import type { ShowId } from "@open-ticket/contracts";

import type { UseCaseDeps } from "../contexts/ticketing/commands/application/index.ts";
import type { Projector } from "../contexts/ticketing/queries/application/index.ts";
import type { Broadcaster, Clock } from "../contexts/ticketing/shared/application/index.ts";
import { registerCors } from "../middlewares/cors.ts";
import { registerErrorHandlers } from "../middlewares/error-handler.ts";

import { registerReservationRoutes } from "./reservation-controller.ts";
import { registerReadRoutes } from "./seat-map-controller.ts";
import { registerSseRoutes } from "./stream-controller.ts";

/**
 * The HTTP assembly: build the Fastify instance, apply the middlewares (error handling + CORS),
 * then register the three thin controllers — reads (seat map, availability, `/health`), the SSE
 * feeds, and the reservation commands. All wiring; no business logic. `buildServer` is called with
 * production adapters by the composition root and with fakes by the test server.
 */
export interface ServerDeps {
  readonly useCases: UseCaseDeps;
  /** Mints a fresh show id on POST /shows (server-generated so clients can't collide). */
  readonly generateShowId: () => ShowId;
  /** The catch-up projection the read routes serve; `/health` reflects its liveness. */
  readonly projector: Projector;
  /** Read-side time source (D2-04) — the same instance the write side uses. */
  readonly clock: Clock;
  /** In-process broadcaster feeding the SSE feeds (D3-03). */
  readonly broadcaster: Broadcaster;
  /** The single allowed CORS origin (D3-05) — the web app; never a wildcard. */
  readonly webOrigin: string;
  /** SSE heartbeat interval; injectable for tests. */
  readonly heartbeatMs?: number;
  readonly logger?: boolean;
}

// A show's inventory can be large; cap the server-wide body so an oversized request can never OOM
// the process. The hot reservation routes tighten this further with their own per-route limit.
const INVENTORY_BODY_LIMIT = 256 * 1024;

export function buildServer(deps: ServerDeps): FastifyInstance {
  const server = Fastify({ logger: deps.logger ?? false, bodyLimit: INVENTORY_BODY_LIMIT });

  registerErrorHandlers(server);
  registerCors(server, deps.webOrigin);

  registerReadRoutes(server, { projector: deps.projector, clock: deps.clock });
  registerSseRoutes(server, {
    projector: deps.projector,
    clock: deps.clock,
    broadcaster: deps.broadcaster,
    ...(deps.heartbeatMs !== undefined ? { heartbeatMs: deps.heartbeatMs } : {}),
  });
  registerReservationRoutes(server, {
    useCases: deps.useCases,
    generateShowId: deps.generateShowId,
  });

  return server;
}
