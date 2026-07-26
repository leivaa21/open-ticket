import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

/**
 * CORS restricted to the web origin (D3-05). An array origin makes @fastify/cors reflect the
 * `Access-Control-Allow-Origin` header only for that exact origin, so a disallowed origin gets no
 * permissive header. Never a wildcard. Only the browser on the web origin may call the API (SSE +
 * command POSTs).
 */
export function registerCors(server: FastifyInstance, webOrigin: string): void {
  void server.register(cors, {
    origin: [webOrigin],
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["content-type"],
  });
}
