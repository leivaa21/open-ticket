import { describe, expect, it } from "vitest";

import { buildTestServer, scheduleShowVia } from "../app/test-server.ts";

describe("error → status mapping (D1-06)", () => {
  it("maps an unknown seat to 422", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);

    const response = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["Z9"], holderId: "buyer" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: { type: "UnknownSeat", seatIds: ["Z9"] } });
  });

  it("maps a reservation on an unknown show to 404", async () => {
    const { server } = buildTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/shows/does-not-exist/reservations",
      payload: { seatIds: ["A1"], holderId: "buyer" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { type: "ShowNotFound" } });
  });

  it("maps a held seat to 409 SeatsUnavailable", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);
    await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer-1" },
    });

    const second = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer-2" },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: { type: "SeatsUnavailable", seatIds: ["A1"] } });
  });

  it("maps confirming an expired hold to 410 (lazy expiry, D1-03)", async () => {
    const { server, clock } = buildTestServer({ holdTtlMs: 1_000 });
    const showId = await scheduleShowVia(server, ["A1"]);
    const reserved = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "buyer" },
    });
    const holdId = reserved.json<{ holdId: string }>().holdId; // reserved at now=1000, expires 2000

    clock.set(2_001); // the hold has now expired
    const confirmed = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations/${holdId}/confirmation`,
    });

    expect(confirmed.statusCode).toBe(410);
    expect(confirmed.json()).toEqual({ error: { type: "HoldExpired" } });
  });

  it("answers an unknown route with a clean 404 (no stack)", async () => {
    // Note: ShowAlreadyScheduled → 409 is unreachable over HTTP by design — POST /shows mints a
    // fresh server-generated id every time, so a client cannot collide. That rule is exercised in
    // the domain and use-case tests; the HTTP mapping exists for completeness (exhaustive table).
    const { server } = buildTestServer();

    const response = await server.inject({ method: "GET", url: "/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { type: "NotFound" } });
  });
});

describe("input hardening (security)", () => {
  it("rejects a malformed body with 400 and no stack/internal leak", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);

    // Missing holderId — well-formed JSON, wrong shape.
    const badShape = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"] },
    });
    expect(badShape.statusCode).toBe(400);
    expect(badShape.json<{ error: { type: string } }>().error.type).toBe("ValidationError");
    expect(badShape.body).not.toMatch(/\bat \S+:\d+/); // no stack frames

    // Malformed JSON — Fastify's parser, mapped to a clean 400.
    const badJson = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: "{ not json",
      headers: { "content-type": "application/json" },
    });
    expect(badJson.statusCode).toBe(400);
    expect(badJson.body).not.toMatch(/stack/i);
  });

  it("rejects empty and duplicate seatIds at the edge (contract validation)", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1", "A2"]);

    const empty = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: [], holderId: "buyer" },
    });
    expect(empty.statusCode).toBe(400);

    const dupes = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1", "A1"], holderId: "buyer" },
    });
    expect(dupes.statusCode).toBe(400);
  });

  it("rejects a reservation of more than 100 seats with 422 TooManySeats", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);
    const seatIds = Array.from({ length: 101 }, (_unused, index) => `S${String(index)}`);

    const response = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds, holderId: "buyer" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { type: string } }>().error.type).toBe("TooManySeats");
  });

  it("enforces the reservation body-size limit with 413", async () => {
    const { server } = buildTestServer();
    const showId = await scheduleShowVia(server, ["A1"]);

    const response = await server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations`,
      payload: { seatIds: ["A1"], holderId: "x".repeat(20_000) }, // > 16 KB reservation limit
    });

    expect(response.statusCode).toBe(413);
    expect(response.body).not.toMatch(/stack/i);
  });
});
