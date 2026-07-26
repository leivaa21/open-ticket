import { describe, expect, it } from "vitest";

import { buildTestServer, scheduleShowVia } from "../app/test-server.ts";

describe("read health — a dead projection must not serve as if live (reviewer nit 4)", () => {
  it("returns 503 from reads and a degraded /health when the projector has crashed", async () => {
    // A throwing reducer makes the projector fail on the first event it processes.
    const ts = buildTestServer({
      reducer: () => {
        throw new Error("reducer boom-secret");
      },
    });
    const showId = await scheduleShowVia(ts.server, ["A1"]); // the write still succeeds
    await ts.projector.settled();
    expect(ts.projector.isHealthy()).toBe(false);

    const seats = await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` });
    expect(seats.statusCode).toBe(503);
    expect(seats.json()).toEqual({ error: { type: "ProjectionUnavailable" } });
    expect(seats.body).not.toMatch(/boom-secret/); // the internal error never leaks

    const summary = await ts.server.inject({ method: "GET", url: `/shows/${showId}` });
    expect(summary.statusCode).toBe(503);

    const health = await ts.server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toEqual({ status: "degraded", projection: "unhealthy" });
    expect(health.body).not.toMatch(/boom-secret/);

    ts.projector.stop();
  });
});
