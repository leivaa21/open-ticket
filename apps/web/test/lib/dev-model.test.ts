import type { DevAppended, DevLag } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import {
  eventTypeColor,
  formatLag,
  LAG_SCALE_MS,
  lagFraction,
  lagState,
  pushEvent,
} from "@/lib/dev-model.ts";

const appended = (position: string): DevAppended => ({ position, type: "SeatsHeld", showId: "s" });
const lag = (behindMs: number): DevLag => ({ behindMs });

describe("pushEvent — bounded rolling buffer", () => {
  it("prepends the newest event (newest first)", () => {
    const buffer = pushEvent([appended("1")], appended("2"), 50);
    expect(buffer.map((event) => event.position)).toEqual(["2", "1"]);
  });

  it("caps the buffer at max, dropping the oldest", () => {
    const filled = [appended("3"), appended("2"), appended("1")];
    expect(pushEvent(filled, appended("4"), 3).map((event) => event.position)).toEqual([
      "4",
      "3",
      "2",
    ]);
  });
});

describe("lagState / lagFraction", () => {
  it("is caught-up (full bar) at zero — the one value that means 'reached the head'", () => {
    expect(lagState(lag(0))).toBe("caught-up");
    expect(lagFraction(lag(0))).toBe(1);
  });

  it("drains the bar as the projection falls behind", () => {
    expect(lagState(lag(1))).toBe("behind"); // a single millisecond is still behind
    expect(lagFraction(lag(LAG_SCALE_MS / 4))).toBe(0.75);
    expect(lagFraction(lag(LAG_SCALE_MS))).toBe(0);
  });

  it("bottoms out rather than going negative past the scale", () => {
    expect(lagFraction(lag(LAG_SCALE_MS * 10))).toBe(0);
  });

  it("renders without an event count — a store that cannot count omits it", () => {
    const withCount: DevLag = { behindMs: 250, behindEvents: 4 };
    expect(lagState(withCount)).toBe("behind");
    expect(lagState(lag(250))).toBe("behind");
  });
});

describe("formatLag", () => {
  it("reads in ms below a second and in seconds above it", () => {
    expect(formatLag(0)).toBe("0ms");
    expect(formatLag(840)).toBe("840ms");
    expect(formatLag(2412)).toBe("2.4s");
  });
});

describe("eventTypeColor", () => {
  it("maps event types to themed status colours", () => {
    expect(eventTypeColor("SeatsSold")).toBe("text-sold");
    expect(eventTypeColor("SeatsHeld")).toBe("text-held");
    expect(eventTypeColor("HoldReleased")).toBe("text-mine");
    expect(eventTypeColor("ShowScheduled")).toBe("text-slate-300");
  });
});
