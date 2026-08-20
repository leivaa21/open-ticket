import { describe, expect, it } from "vitest";

import { SeatsSold } from "./events.ts";
import type { DomainEvent, PersistedEvent } from "./index.ts";

describe("DomainEvent envelope", () => {
  it("carries the stream id, revision and record time an event store appends on", () => {
    const event: DomainEvent<"SeatsSold", { holdId: string; seatIds: readonly string[] }> = {
      type: "SeatsSold",
      streamId: "show-42",
      revision: 3,
      recordedAt: 1_700_000_000_000,
      payload: { holdId: "hold-1", seatIds: ["A1"] },
    };

    expect(event.type).toBe("SeatsSold");
    expect(event.revision).toBe(3);
    expect(event.recordedAt).toBe(1_700_000_000_000);
  });
});

describe("PersistedEvent", () => {
  it("wraps a parsed fact with the store's envelope, keeping type and payload in lockstep", () => {
    const fact = SeatsSold.parse({
      type: "SeatsSold",
      payload: { holdId: "hold-1", seatIds: ["A1", "A2"] },
    });

    // The store adds streamId/revision/recordedAt to the bare fact — this must type-check as a
    // SeatsSold persisted event (type "SeatsSold" pairs only with a SeatsSold payload).
    const persisted: PersistedEvent = {
      ...fact,
      streamId: "show-42",
      revision: 7,
      recordedAt: 1_700_000_000_000,
    };

    expect(persisted.streamId).toBe("show-42");
    expect(persisted.type).toBe("SeatsSold");
    expect(persisted.payload.seatIds).toHaveLength(2);
  });
});
