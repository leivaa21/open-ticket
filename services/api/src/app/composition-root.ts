import { randomUUID } from "node:crypto";

import { ShowId } from "@open-ticket/contracts";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../controllers/register.ts";
import { Projector } from "../contexts/ticketing/queries/application/index.ts";
import { Broadcaster } from "../contexts/ticketing/shared/application/index.ts";
import {
  InMemoryEventStore,
  SystemClock,
  UuidGenerator,
} from "../contexts/ticketing/shared/infrastructure/index.ts";

import type { Config } from "./config.ts";

/**
 * Composition root — the only place the interface layer touches infrastructure. Wires config +
 * real adapters into the server. ONE `InMemoryEventStore` is both the write `EventStore` and the
 * read `EventLog`; a single `Projector` subscribes to it from the start of the log and stays live,
 * catching up as writes append (in-memory + rebuildable — durable projections are M4). One
 * `SystemClock` is shared by the write side, the read side AND the store: hold liveness is judged
 * against the same time source that stamps each event's `recordedAt`, so projection lag is
 * measured on the same clock it is created on.
 */
export function buildApp(config: Config): FastifyInstance {
  const clock = new SystemClock();
  const store = new InMemoryEventStore(clock);
  const broadcaster = new Broadcaster();
  const projector = new Projector({ log: store, clock, broadcaster });
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
    broadcaster,
    webOrigin: config.WEB_ORIGIN,
    logger: true,
  });
}
