import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodError } from "zod";

import type { Rejection } from "../contexts/ticketing/commands/application/index.ts";

/**
 * The one place command outcomes become HTTP (D1-06). Handlers stay thin: they call a use case and
 * hand the typed rejection here. The response body echoes only the domain's own typed error (its
 * `type`, and the offending seat ids where present) — never an internal message or stack.
 *
 * | rejection             | status | meaning                                             |
 * | --------------------- | ------ | --------------------------------------------------- |
 * | ShowNotFound          | 404    | no such show/stream                                 |
 * | HoldNotFound          | 404    | no such (live) hold                                 |
 * | ShowAlreadyScheduled  | 409    | the show already exists                             |
 * | SeatsUnavailable      | 409    | requested seats are sold or held                    |
 * | Conflict              | 409    | optimistic-append retries exhausted under contention|
 * | UnknownSeat           | 422    | seats not in the show's inventory                   |
 * | HoldExpired           | 410    | the hold's TTL passed (Gone)                         |
 */
const REJECTION_STATUS: Record<Rejection["type"], number> = {
  ShowNotFound: 404,
  HoldNotFound: 404,
  ShowAlreadyScheduled: 409,
  SeatsUnavailable: 409,
  Conflict: 409,
  UnknownSeat: 422,
  HoldExpired: 410,
};

export function sendRejection(reply: FastifyReply, error: Rejection): FastifyReply {
  return reply.status(REJECTION_STATUS[error.type]).send({ error });
}

export function sendValidationError(reply: FastifyReply, error: ZodError): FastifyReply {
  const issues = error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
  return reply.status(400).send({ error: { type: "ValidationError", issues } });
}

/**
 * Client errors (bad JSON, oversized body) pass through with a generic body; anything else is an
 * unexpected server fault — logged server-side, answered 500 with no detail (no internal leak).
 */
export function registerErrorHandlers(server: FastifyInstance): void {
  server.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({ error: { type: "NotFound" } });
  });

  server.setErrorHandler((error: unknown, request, reply) => {
    const code = statusCodeOf(error);
    const clientStatus = code !== undefined && code >= 400 && code < 500 ? code : undefined;
    if (clientStatus === undefined) request.log.error({ err: error }, "unhandled error");
    const status = clientStatus ?? 500;
    void reply
      .status(status)
      .send({ error: { type: status >= 500 ? "InternalError" : "BadRequest" } });
  });
}

/** Fastify's own errors (bad JSON → 400, oversized body → 413) carry a numeric `statusCode`. */
function statusCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const code: unknown = error.statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}
