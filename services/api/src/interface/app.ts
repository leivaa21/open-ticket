import { randomUUID } from "node:crypto";

import { ShowId } from "@open-ticket/contracts";
import type { FastifyInstance } from "fastify";

import { Projector } from "../application/index.ts";
import type { Config } from "../config.ts";
import { InMemoryEventStore, SystemClock, UuidGenerator } from "../infrastructure/index.ts";

import { buildServer } from "./server.ts";

/**
 * Composition root — the only place the interface layer touches infrastructure. Wires config +
 * real adapters into the server. ONE `InMemoryEventStore` is both the write `EventStore` and the
 * read `EventLog`; a single `Projector` subscribes to it from position 0 and stays live, catching
 * up as writes append (in-memory + rebuildable — durable projections are M4). The write side and
 * the read side share one `SystemClock`, so hold liveness is judged against the same time source.
 */
export function buildApp(config: Config): FastifyInstance {
  const store = new InMemoryEventStore();
  const clock = new SystemClock();
  const projector = new Projector({ log: store });
  return buildServer({
    useCases: {
      store,
      clock,
      ids: new UuidGenerator(),
      holdTtlMs: config.HOLD_TTL_MS,
      maxAttempts: config.MAX_APPEND_ATTEMPTS,
    },
    generateShowId: () => ShowId.parse(randomUUID()),
    projector,
    clock,
    logger: true,
  });
}
