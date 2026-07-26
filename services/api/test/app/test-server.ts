import { randomUUID } from "node:crypto";

import { ShowId } from "@open-ticket/contracts";
import type { EpochMillis } from "@open-ticket/contracts";
import type { FastifyInstance } from "fastify";

import { buildServer } from "@api/controllers/register.ts";
import { Projector } from "@api/contexts/ticketing/queries/application/index.ts";
import type { ProjectorDeps } from "@api/contexts/ticketing/queries/application/index.ts";
import { Broadcaster, type Clock } from "@api/contexts/ticketing/shared/application/index.ts";
import {
  InMemoryEventStore,
  UuidGenerator,
} from "@api/contexts/ticketing/shared/infrastructure/index.ts";

/** The web origin allowed in tests — matches the config default. */
export const TEST_WEB_ORIGIN = "http://localhost:5200";

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
  readonly broadcaster: Broadcaster;
}

export interface TestServerOptions {
  readonly holdTtlMs?: number;
  /** Force the projection unhealthy (a throwing reducer) to test the 503 path. */
  readonly reducer?: ProjectorDeps["reducer"];
  /** SSE heartbeat interval (default 15s); tests keep it short only when needed. */
  readonly heartbeatMs?: number;
}

export function buildTestServer(options: TestServerOptions = {}): TestServer {
  const store = new InMemoryEventStore();
  const clock = new MutableClock(1_000);
  const broadcaster = new Broadcaster();
  const projector = new Projector({
    log: store,
    broadcaster,
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
    broadcaster,
    webOrigin: TEST_WEB_ORIGIN,
    ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
  });
  return { server, store, clock, projector, broadcaster };
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
