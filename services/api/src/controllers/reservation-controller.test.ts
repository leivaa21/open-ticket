import { describe, expect, it } from "vitest";

import { buildTestServer, scheduleShowVia } from "../app/test-server.ts";

describe("health", () => {
  it("answers the probe", async () => {
    const { server } = buildTestServer();

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", projection: "healthy" });
  });
});

describe("the reservation flow over HTTP (schedule → reserve → confirm)", () => {
  it("schedules a show (201 + generated id), holds a seat, and confirms it", async () => {
    const { server } = buildTestServer();

    const scheduled = await server.inject({
      method: "POST",
      url: "/shows",
      payload: { seatIds: ["A1", "A2"] },
    });
    expect(scheduled.statusCode).toBe(201);
    const showId = scheduled.json<{ showId: string }>().showId;
    expect(showId).toMatch(/[0-9a-f-]{36}/);

    const reserved = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer-1" },
    });
    expect(reserved.statusCode).toBe(201);
    const holdId = reserved.json<{ holdId: string }>().holdId;
    expect(typeof holdId).toBe("string");

    const confirmed = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations/${holdId}/confirmation`,
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ status: "confirmed" });
    expect(confirmed.json<{ commitPosition: number }>().commitPosition).toBeGreaterThanOrEqual(0);
  });

  it("releases a hold, freeing the seat for another reservation", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);

    const reserved = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer-1" },
    });
    const holdId = reserved.json<{ holdId: string }>().holdId;

    const released = await server.inject({
      method: "DELETE",
      url: `/shows/${showId}/reservations/${holdId}`,
    });
    expect(released.statusCode).toBe(200);
    expect(released.json()).toMatchObject({ status: "released" });
    expect(released.json<{ commitPosition: number }>().commitPosition).toBeGreaterThanOrEqual(0);

    // The seat is available again.
    const reReserved = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer-2" },
    });
    expect(reReserved.statusCode).toBe(201);
  });

  it("rejects a double confirmation (the live hold is gone) with 404", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);
    const reserved = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer-1" },
    });
    const holdId = reserved.json<{ holdId: string }>().holdId;
    const confirmUrl = `/shows/${showId}/reservations/${holdId}/confirmation`;

    expect((await server.inject({ method: "POST", url: confirmUrl })).statusCode).toBe(200);
    const second = await server.inject({ method: "POST", url: confirmUrl });

    expect(second.statusCode).toBe(404);
    expect(second.json()).toEqual({ error: { type: "HoldNotFound" } });
  });
});
