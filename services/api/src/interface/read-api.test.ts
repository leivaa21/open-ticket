import { AvailabilityView, SeatMapView } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import { buildTestServer, scheduleShowVia } from "./test-server.ts";
import type { TestServer } from "./test-server.ts";

/** POST a reservation and return the parsed body (holdId + commitPosition). */
async function reserve(
  ts: TestServer,
  showId: string,
  seatIds: readonly string[],
): Promise<{ holdId: string; commitPosition: number }> {
  const response = await ts.server.inject({
    method: "POST",
    url: `/shows/${showId}/reservations`,
    payload: { seatIds, holderId: "buyer" },
  });
  return response.json<{ holdId: string; commitPosition: number }>();
}

const seatStatus = (view: SeatMapView, seatId: string) =>
  view.seats.find((seat) => seat.seatId === seatId)?.status;

describe("GET read API — projection over HTTP (D2-05)", () => {
  it("reflects the write lifecycle: available → held → sold, with asOf advancing", async () => {
    const ts = buildTestServer();
    const showId = await scheduleShowVia(ts.server, ["A1", "A2"]);
    await ts.projector.settled();

    // All available right after scheduling; the DTO matches the contract schema.
    const initial = await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` });
    expect(initial.statusCode).toBe(200);
    const initialView = SeatMapView.parse(initial.json());
    expect(initialView.seats).toEqual([
      { seatId: "A1", status: "available" },
      { seatId: "A2", status: "available" },
    ]);
    expect(initialView.asOf).toBeGreaterThanOrEqual(0);

    // Reserve A1 → read-your-writes: asOf catches up past the write's commitPosition.
    const { holdId, commitPosition } = await reserve(ts, showId, ["A1"]);
    await ts.projector.settled();
    const held = SeatMapView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` })).json(),
    );
    expect(seatStatus(held, "A1")).toBe("held");
    expect(seatStatus(held, "A2")).toBe("available");
    expect(held.asOf).toBeGreaterThanOrEqual(commitPosition);

    // Availability summary reflects it.
    const summary = AvailabilityView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}` })).json(),
    );
    expect(summary).toMatchObject({ total: 2, available: 1, held: 1, sold: 0 });

    // Confirm → sold.
    await ts.server.inject({
      method: "POST",
      url: `/shows/${showId}/reservations/${holdId}/confirmation`,
    });
    await ts.projector.settled();
    const sold = SeatMapView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` })).json(),
    );
    expect(seatStatus(sold, "A1")).toBe("sold");

    ts.projector.stop();
  });

  it("a released hold reads available again", async () => {
    const ts = buildTestServer();
    const showId = await scheduleShowVia(ts.server, ["A1"]);
    const { holdId } = await reserve(ts, showId, ["A1"]);
    await ts.projector.settled();

    await ts.server.inject({ method: "DELETE", url: `/shows/${showId}/reservations/${holdId}` });
    await ts.projector.settled();

    const view = SeatMapView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` })).json(),
    );
    expect(seatStatus(view, "A1")).toBe("available");
    ts.projector.stop();
  });

  it("crosses an expiry boundary in the READ via the clock — no event needed (D2-04)", async () => {
    const ts = buildTestServer({ holdTtlMs: 1_000 }); // clock starts at 1000 → hold expires at 2000
    const showId = await scheduleShowVia(ts.server, ["A1"]);
    await reserve(ts, showId, ["A1"]);
    await ts.projector.settled();
    const asOfBefore = SeatMapView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` })).json(),
    ).asOf;

    const before = SeatMapView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` })).json(),
    );
    expect(seatStatus(before, "A1")).toBe("held"); // now = 1000 < 2000

    ts.clock.set(2_000); // reach the boundary — live iff expiresAt > now, so now === 2000 is dead
    const after = SeatMapView.parse(
      (await ts.server.inject({ method: "GET", url: `/shows/${showId}/seats` })).json(),
    );
    expect(seatStatus(after, "A1")).toBe("available"); // flipped in the read, with no new event
    expect(after.asOf).toBe(asOfBefore); // no event appended — the projection did not move
    ts.projector.stop();
  });

  it("returns 404 for a show that was never projected (D2-05: not visible)", async () => {
    const ts = buildTestServer();
    await ts.projector.settled();

    const seats = await ts.server.inject({ method: "GET", url: "/shows/ghost/seats" });
    expect(seats.statusCode).toBe(404);
    expect(seats.json()).toEqual({ error: { type: "NotFound" } });

    const summary = await ts.server.inject({ method: "GET", url: "/shows/ghost" });
    expect(summary.statusCode).toBe(404);
    ts.projector.stop();
  });
});
