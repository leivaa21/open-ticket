import { randomUUID } from "node:crypto";

import { ShowId } from "@open-ticket/contracts";
import type { FastifyInstance } from "fastify";

import type { Config } from "../config.ts";
import { InMemoryEventStore, SystemClock, UuidGenerator } from "../infrastructure/index.ts";

import { buildServer } from "./server.ts";

/**
 * Composition root — the only place the interface layer touches infrastructure. Wires config +
 * real adapters into the server. The `InMemoryEventStore` is a single instance per process, so a
 * scheduled show and its holds persist across requests (until the process restarts — M1's store is
 * not durable; that is EventStoreDB's job in M4).
 */
export function buildApp(config: Config): FastifyInstance {
  const store = new InMemoryEventStore();
  return buildServer({
    useCases: {
      store,
      clock: new SystemClock(),
      ids: new UuidGenerator(),
      holdTtlMs: config.HOLD_TTL_MS,
      maxAttempts: config.MAX_APPEND_ATTEMPTS,
    },
    generateShowId: () => ShowId.parse(randomUUID()),
    logger: true,
  });
}
