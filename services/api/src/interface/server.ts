import Fastify, { type FastifyInstance } from "fastify";

/**
 * Builds the HTTP surface. The interface layer stays thin: it wires routes to use cases and maps
 * results to status codes — no business logic lives here. M1 mounts the reservation command
 * routes; for now it exposes only a health probe so the service is verifiable end-to-end.
 */
export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: false });

  server.get("/health", () => ({ status: "ok" }));

  return server;
}
