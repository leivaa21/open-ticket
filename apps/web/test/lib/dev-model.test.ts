import type { DevAppended, DevLag } from "@open-ticket/contracts";
import { describe, expect, it } from "vitest";

import { eventTypeColor, lagFraction, lagState, pushEvent } from "@/lib/dev-model.ts";

const appended = (position: number): DevAppended => ({ position, type: "SeatsHeld", showId: "s" });
const lag = (head: number, asOf: number, behind: number): DevLag => ({ head, asOf, behind });

describe("pushEvent — bounded rolling buffer", () => {
  it("prepends the newest event (newest first)", () => {
    const buffer = pushEvent([appended(1)], appended(2), 50);
    expect(buffer.map((event) => event.position)).toEqual([2, 1]);
  });

  it("caps the buffer at max, dropping the oldest", () => {
    const filled = [appended(3), appended(2), appended(1)];
    expect(pushEvent(filled, appended(4), 3).map((event) => event.position)).toEqual([4, 3, 2]);
  });
});

describe("lagState / lagFraction", () => {
  it("is caught-up (full) when behind is 0", () => {
    expect(lagState(lag(5, 4, 0))).toBe("caught-up");
    expect(lagFraction(lag(5, 4, 0))).toBe(1);
  });

  it("is behind (partial fill) when behind > 0", () => {
    expect(lagState(lag(4, 2, 1))).toBe("behind");
    expect(lagFraction(lag(4, 2, 1))).toBe(0.75); // processed 3 of 4
    expect(lagFraction(lag(5, -1, 5))).toBe(0); // nothing processed
  });

  it("reads caught-up with an empty log (head 0)", () => {
    expect(lagFraction(lag(0, -1, 0))).toBe(1);
    expect(lagState(lag(0, -1, 0))).toBe("caught-up");
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
