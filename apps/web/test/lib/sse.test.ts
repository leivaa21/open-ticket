import type { SeatMapView } from "@open-ticket/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EventSourceLike } from "@/lib/sse.ts";
import { parseSeatMapView, seatStreamUrl, subscribeSeatMap } from "@/lib/sse.ts";

/** A fake EventSource a test can push frames into and inspect. */
class FakeEventSource implements EventSourceLike {
  public closed = false;
  private readonly listeners = new Map<string, ((event: { data: string }) => void)[]>();

  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

const view = (asOf: string): SeatMapView =>
  ({ showId: "show-1", asOf, seats: [{ seatId: "A1", status: "available" }] }) as SeatMapView;

describe("parseSeatMapView", () => {
  it("parses a well-formed frame and rejects malformed ones", () => {
    expect(parseSeatMapView(JSON.stringify(view("2")))?.asOf).toBe("2");
    expect(parseSeatMapView("not json")).toBeUndefined();
    expect(parseSeatMapView(JSON.stringify({ nope: true }))).toBeUndefined();
  });
});

describe("seatStreamUrl", () => {
  it("builds the stream url against the API base, encoding the show id", () => {
    expect(seatStreamUrl("a b")).toBe("http://localhost:5210/shows/a%20b/seats/stream");
  });
});

describe("subscribeSeatMap", () => {
  it("forwards each seatmap frame, ignores junk, and closes on unsubscribe (unmount cleanup)", () => {
    const source = new FakeEventSource();
    const onFrame = vi.fn();
    const onError = vi.fn();

    const unsubscribe = subscribeSeatMap("show-1", onFrame, onError, () => source);

    source.emit("seatmap", JSON.stringify(view("1")));
    source.emit("seatmap", "garbage"); // ignored, not delivered
    source.emit("seatmap", JSON.stringify(view("2")));
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ asOf: "2" }));

    source.emit("error", "");
    expect(onError).toHaveBeenCalledOnce();

    expect(source.closed).toBe(false);
    unsubscribe();
    expect(source.closed).toBe(true); // the hook's cleanup closes the stream
  });
});
