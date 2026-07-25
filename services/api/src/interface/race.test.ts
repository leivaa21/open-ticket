import { describe, expect, it } from "vitest";

import { buildTestServer, scheduleShowVia } from "./test-server.ts";

/**
 * The M1 headline proven at the HTTP layer: two buyers race for the same seat. Determinism does not
 * come from scheduling luck — the in-memory store's append is atomic and revision-checked (proven
 * in PR3), so whichever request appends second gets a `ConcurrencyError`, retries, re-reads the
 * winner's hold, and cleanly fails. The invariant (exactly one winner, no double-hold, no 500)
 * therefore holds regardless of which racer wins. Looped over several seats for extra confidence.
 */
describe("THE concurrency race over HTTP (D1-05)", () => {
  it("lets exactly one of two concurrent reservations win; the other gets a clean 4xx", async () => {
    const { server, store } = buildTestServer();
    const seatIds = ["A1", "A2", "A3", "A4", "A5"];
    const showId = await scheduleShowVia(server, seatIds);

    for (const seat of seatIds) {
      const reserve = (holder: string) =>
        server.inject({
          method: "POST",
          url: `/shows/${showId}/reservations`,
          payload: { seatIds: [seat], holderId: holder },
        });

      const [a, b] = await Promise.all([reserve("alice"), reserve("bob")]);
      const codes = [a.statusCode, b.statusCode];

      // Exactly one success, one clean rejection — never two successes, never a 500.
      expect(codes.filter((code) => code === 201)).toHaveLength(1);
      expect(codes).not.toContain(500);
      const loser = [a, b].find((response) => response.statusCode !== 201);
      if (loser === undefined) throw new Error("expected one reservation to lose");
      expect(loser.statusCode).toBe(409);
      expect(loser.json<{ error: { type: string } }>().error.type).toBe("SeatsUnavailable");
    }

    // On disk: each seat is held exactly once across all the races — no double-hold.
    const events = (await store.readStream(showId)).events;
    const heldSeats = events
      .filter((event) => event.type === "SeatsHeld")
      .flatMap((event) => [...event.payload.seatIds].map(String));
    expect(heldSeats.sort()).toEqual([...seatIds].sort());
  });
});
