import { describe, expect, it } from "vitest";

import { formatSseFrame } from "./sse.ts";

describe("formatSseFrame — the SSE wire format", () => {
  it("formats an event + JSON data frame terminated by a blank line", () => {
    expect(formatSseFrame({ event: "seatmap", data: { asOf: 2, seats: [] } })).toBe(
      'event: seatmap\ndata: {"asOf":2,"seats":[]}\n\n',
    );
  });

  it("omits the event line when only data is given", () => {
    expect(formatSseFrame({ data: { position: 3 } })).toBe('data: {"position":3}\n\n');
  });

  it("formats a comment (heartbeat) frame, invisible to EventSource handlers", () => {
    expect(formatSseFrame({ comment: "ping" })).toBe(": ping\n\n");
  });
});
