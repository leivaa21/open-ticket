import type { DevAppended, DevLag } from "@open-ticket/contracts";
import { describe, expect, it, vi } from "vitest";

import { devStreamUrl, parseAppended, parseLag, subscribeDevStream } from "@/lib/dev-stream.ts";
import type { EventSourceLike } from "@/lib/sse.ts";

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

const appended: DevAppended = { position: 3, type: "SeatsHeld", showId: "show-1" };
const lag: DevLag = { head: 5, asOf: 2, behind: 2 };

describe("parseAppended / parseLag", () => {
  it("parses well-formed frames and rejects malformed ones", () => {
    expect(parseAppended(JSON.stringify(appended))).toEqual(appended);
    expect(parseAppended("not json")).toBeUndefined();
    expect(parseAppended(JSON.stringify({ position: "x" }))).toBeUndefined();

    expect(parseLag(JSON.stringify(lag))).toEqual(lag);
    expect(parseLag(JSON.stringify({ head: 1 }))).toBeUndefined();
  });
});

describe("devStreamUrl", () => {
  it("targets /dev/stream on the API base", () => {
    expect(devStreamUrl()).toBe("http://localhost:5210/dev/stream");
  });
});

describe("subscribeDevStream", () => {
  it("forwards appended + lag frames, ignores junk, and closes on unsubscribe", () => {
    const source = new FakeEventSource();
    const onAppended = vi.fn();
    const onLag = vi.fn();

    const unsubscribe = subscribeDevStream({
      onAppended,
      onLag,
      eventSourceFactory: () => source,
    });

    source.emit("appended", JSON.stringify(appended));
    source.emit("appended", "garbage"); // ignored, not forwarded
    source.emit("lag", JSON.stringify(lag));
    expect(onAppended).toHaveBeenCalledTimes(1);
    expect(onAppended).toHaveBeenCalledWith(appended);
    expect(onLag).toHaveBeenCalledTimes(1);
    expect(onLag).toHaveBeenCalledWith(lag);

    expect(source.closed).toBe(false);
    unsubscribe();
    expect(source.closed).toBe(true);
  });
});
