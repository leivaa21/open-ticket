import { randomUUID } from "node:crypto";

import { ShowId } from "@open-ticket/contracts";
import type { EpochMillis } from "@open-ticket/contracts";
import type { FastifyInstance } from "fastify";

import { Projector } from "../application/index.ts";
import type { Clock, ProjectorDeps } from "../application/index.ts";
import { InMemoryEventStore, UuidGenerator } from "../infrastructure/index.ts";

import { buildServer } from "./server.ts";

/**
 * Test-only wiring: a fresh store + projector per server (isolation), a controllable clock so
 * expiry boundaries are deterministic, and an optional reducer override so a test can force the
 * projection unhealthy. Not a `.test.ts`, so Vitest never runs it.
 */
export class MutableClock implements Clock {
  constructor(private millis: number) {}
  now(): EpochMillis {
    return this.millis;
  }
  set(millis: number): void {
    this.millis = millis;
  }
}

export interface TestServer {
  readonly server: FastifyInstance;
  readonly store: InMemoryEventStore;
  readonly clock: MutableClock;
  readonly projector: Projector;
}

export interface TestServerOptions {
  readonly holdTtlMs?: number;
  /** Force the projection unhealthy (a throwing reducer) to test the 503 path. */
  readonly reducer?: ProjectorDeps["reducer"];
}

export function buildTestServer(options: TestServerOptions = {}): TestServer {
  const store = new InMemoryEventStore();
  const clock = new MutableClock(1_000);
  const projector = new Projector({
    log: store,
    ...(options.reducer !== undefined ? { reducer: options.reducer } : {}),
  });
  const server = buildServer({
    useCases: {
      store,
      clock,
      ids: new UuidGenerator(),
      holdTtlMs: options.holdTtlMs ?? 600_000,
      maxAttempts: 3,
    },
    generateShowId: () => ShowId.parse(randomUUID()),
    projector,
    clock,
  });
  return { server, store, clock, projector };
}

/** Schedule a show over HTTP and return its server-generated id. */
export async function scheduleShowVia(
  server: FastifyInstance,
  seatIds: readonly string[],
): Promise<string> {
  const response = await server.inject({ method: "POST", url: "/shows", payload: { seatIds } });
  const body: unknown = response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { showId?: unknown }).showId !== "string"
  ) {
    throw new Error(`schedule did not return a showId: ${response.body}`);
  }
  return (body as { showId: string }).showId;
}
