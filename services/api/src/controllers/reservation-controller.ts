import { ConfirmPurchase, ReleaseHold, ReserveSeats, ScheduleShow } from "@open-ticket/contracts";
import type { ShowId } from "@open-ticket/contracts";
import type { FastifyInstance } from "fastify";

import {
  confirmPurchase,
  releaseHold,
  reserveSeats,
  scheduleShow,
} from "../contexts/ticketing/commands/application/index.ts";
import type { UseCaseDeps } from "../contexts/ticketing/commands/application/index.ts";
import { sendRejection, sendValidationError } from "../middlewares/error-handler.ts";

import { bodyRecord } from "./request-body.ts";

/**
 * The command surface (write side) over HTTP: each handler builds a command from route params +
 * body, parses it against the contract schema at the edge (never trust the client), calls the use
 * case, and maps the typed result to a status. No business logic lives here.
 */
export interface ReservationDeps {
  readonly useCases: UseCaseDeps;
  /** Mints a fresh show id on POST /shows (server-generated so clients can't collide). */
  readonly generateShowId: () => ShowId;
}

// A single reservation is a handful of ids; cap the body so an oversized one can never OOM the
// process, tightening the hot reservation routes beyond the server-wide inventory limit.
const RESERVATION_BODY_LIMIT = 16 * 1024;
/** A single hold over this many seats is abuse/error — rejected before the domain (422). */
const MAX_SEATS_PER_RESERVATION = 100;

export function registerReservationRoutes(server: FastifyInstance, deps: ReservationDeps): void {
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
          .send({ showId: parsed.data.showId, commitPosition: result.value.commitPosition.token })
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
        ? reply.status(201).send({
            holdId: result.value.holdId,
            commitPosition: result.value.commitPosition.token,
          })
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
            .send({ status: "confirmed", commitPosition: result.value.commitPosition.token })
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
            .send({ status: "released", commitPosition: result.value.commitPosition.token })
        : sendRejection(reply, result.error);
    },
  );
}
