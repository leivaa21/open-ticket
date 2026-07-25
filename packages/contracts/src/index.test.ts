import { describe, expect, it } from "vitest";

import type { DomainEvent } from "./index.ts";

describe("DomainEvent envelope", () => {
  it("carries the stream id and revision an event store appends on", () => {
    const event: DomainEvent<"SeatReserved", { seatId: string }> = {
      type: "SeatReserved",
      streamId: "show-42",
      revision: 0,
      payload: { seatId: "A1" },
    };

    expect(event.type).toBe("SeatReserved");
    expect(event.revision).toBe(0);
  });
});
