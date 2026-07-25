import type { AddressInfo } from "node:net";

import type { SeatMapView } from "@open-ticket/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { connectSse } from "./sse-client.ts";
import { buildTestServer } from "./test-server.ts";
import type { TestServer } from "./test-server.ts";

/**
 * SSE streams over a real socket (Fastify `inject` can't stream). Writes go through `inject`
 * (same shared store) so no extra sockets or `fetch` keep-alive connections linger — the only
 * open handle is the one SSE socket, closed in teardown. Heartbeats are unref'd, so nothing keeps
 * vitest alive after teardown.
 */
let live: TestServer | undefined;

afterEach(async () => {
  if (live) {
    live.projector.stop();
    await live.server.close();
    live = undefined;
  }
});

async function listen(options?: { holdTtlMs?: number }): Promise<{ ts: TestServer; base: string }> {
  const ts = buildTestServer(options ?? {});
  live = ts;
  await ts.server.listen({ port: 0, host: "127.0.0.1" });
  const address = ts.server.server.address() as AddressInfo;
  return { ts, base: `http://127.0.0.1:${String(address.port)}` };
}

async function scheduleShow(ts: TestServer, seatIds: string[]): Promise<string> {
  const response = await ts.server.inject({ method: "POST", url: "/shows", payload: { seatIds } });
  await ts.projector.settled();
  return response.json<{ showId: string }>().showId;
}

describe("GET /shows/:showId/seats/stream (D3-02)", () => {
  it("pushes an initial seatmap, then a fresh one when the show advances, then cleans up", async () => {
    const { ts, base } = await listen();
    const showId = await scheduleShow(ts, ["A1", "A2"]);

    const client = connectSse(`${base}/shows/${showId}/seats/stream`);
    const initial = await client.next();
    expect(initial.event).toBe("seatmap");
    const initialView = JSON.parse(initial.data) as SeatMapView;
    expect(initialView.seats.map((seat) => seat.status)).toEqual(["available", "available"]);
    expect(ts.broadcaster.listenerCount("seatChanged")).toBe(1);

    // Reserve A1 via the write path (inject → same store → projector → broadcaster → this socket).
    await ts.server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer" },
    });
    await ts.projector.settled();

    const update = await client.next();
    expect(update.event).toBe("seatmap");
    const updatedView = JSON.parse(update.data) as SeatMapView;
    expect(updatedView.seats.find((seat) => seat.seatId === "A1")?.status).toBe("held");
    expect(updatedView.asOf).toBeGreaterThanOrEqual(initialView.asOf);

    // Disconnect → the server unsubscribes (no leak).
    client.close();
    await waitUntil(() => ts.broadcaster.listenerCount("seatChanged") === 0);
  });

  it("returns 404 for an unseen show without opening a stream", async () => {
    const { ts } = await listen();
    const response = await ts.server.inject({ method: "GET", url: "/shows/ghost/seats/stream" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { type: "NotFound" } });
  });
});

describe("GET /dev/stream (D3-02)", () => {
  it("pushes an initial lag snapshot, then appended + lag frames as events flow", async () => {
    const { ts, base } = await listen();

    const client = connectSse(`${base}/dev/stream`);
    const initialLag = await client.next();
    expect(initialLag.event).toBe("lag");
    expect(JSON.parse(initialLag.data)).toEqual({ head: 0, asOf: -1, behind: 0 });

    await ts.server.inject({ method: "POST", url: "/shows", payload: { seatIds: ["A1"] } });
    await ts.projector.settled();

    const appended = await client.next();
    expect(appended.event).toBe("appended");
    expect(JSON.parse(appended.data)).toMatchObject({ position: 0, type: "ShowScheduled" });

    const lag = await client.next();
    expect(lag.event).toBe("lag");
    expect(JSON.parse(lag.data)).toEqual({ head: 1, asOf: 0, behind: 0 });

    client.close();
  });
});

/** Poll until a predicate holds, or fail fast (no hanging). */
async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for a condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
