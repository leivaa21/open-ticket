import { describe, expect, it, vi } from "vitest";

import { Broadcaster } from "@api/contexts/ticketing/shared/application/broadcaster.ts";

describe("Broadcaster (D3-03)", () => {
  it("delivers an emitted payload to a subscribed listener", () => {
    const broadcaster = new Broadcaster();
    const listener = vi.fn();
    broadcaster.on("appended", listener);

    broadcaster.emit("appended", { position: "3", type: "SeatsHeld", showId: "show-1" });

    expect(listener).toHaveBeenCalledWith({ position: "3", type: "SeatsHeld", showId: "show-1" });
  });

  it("unsubscribe stops delivery and drops the listener count to 0", () => {
    const broadcaster = new Broadcaster();
    const listener = vi.fn();
    const off = broadcaster.on("lag", listener);
    expect(broadcaster.listenerCount("lag")).toBe(1);

    off();
    broadcaster.emit("lag", { behindMs: 0, behindEvents: 0 });

    expect(listener).not.toHaveBeenCalled();
    expect(broadcaster.listenerCount("lag")).toBe(0);
  });

  it("fans out to multiple subscribers of the same signal", () => {
    const broadcaster = new Broadcaster();
    const a = vi.fn();
    const b = vi.fn();
    broadcaster.on("seatChanged", a);
    broadcaster.on("seatChanged", b);

    broadcaster.emit("seatChanged", { showId: "show-1" });

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("isolates a throwing subscriber: emit does not throw, and peers still fire", () => {
    const broadcaster = new Broadcaster();
    const boom = vi.fn(() => {
      throw new Error("flaky SSE subscriber");
    });
    const peer = vi.fn();
    broadcaster.on("seatChanged", boom);
    broadcaster.on("seatChanged", peer);

    // The projector emits in its critical path — a subscriber throw must not propagate back out
    // (which would kill the read side) nor starve the peer registered after it.
    expect(() => {
      broadcaster.emit("seatChanged", { showId: "show-1" });
    }).not.toThrow();
    expect(boom).toHaveBeenCalledOnce();
    expect(peer).toHaveBeenCalledOnce();
  });

  it("routes per-show: a show-A change does not wake a show-B listener", () => {
    const broadcaster = new Broadcaster();
    const showA = vi.fn();
    const showB = vi.fn();
    broadcaster.onShowChanged("show-A", showA);
    broadcaster.onShowChanged("show-B", showB);

    broadcaster.emit("seatChanged", { showId: "show-A" });

    expect(showA).toHaveBeenCalledOnce();
    expect(showB).not.toHaveBeenCalled();
  });

  it("onShowChanged unsubscribe removes its underlying seatChanged listener", () => {
    const broadcaster = new Broadcaster();
    const off = broadcaster.onShowChanged("show-A", vi.fn());
    expect(broadcaster.listenerCount("seatChanged")).toBe(1);

    off();

    expect(broadcaster.listenerCount("seatChanged")).toBe(0);
  });
});
