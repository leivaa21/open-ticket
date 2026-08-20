import { describe, expect, it } from "vitest";

import { confirmCmd, makeDeps, releaseCmd, reserveCmd, scheduleCmd } from "./test-support.ts";
import type { UseCaseResult } from "@api/contexts/ticketing/commands/application/results.ts";
import type { UseCaseDeps } from "@api/contexts/ticketing/commands/application/use-cases.ts";
import {
  confirmPurchase,
  releaseHold,
  reserveSeats,
  scheduleShow,
} from "@api/contexts/ticketing/commands/application/use-cases.ts";

/** Narrow a result to its value — a rejection here is a test failure, not a branch to handle. */
function valueOf<T>(result: UseCaseResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.type}`);
  return result.value;
}

/** A deps bundle whose show "show-1" is already scheduled with seats A1, A2. */
async function withScheduledShow(): Promise<UseCaseDeps> {
  const deps = makeDeps();
  await scheduleShow(deps, scheduleCmd("show-1", "A1", "A2"));
  return deps;
}

describe("scheduleShow use case", () => {
  it("creates the stream, its first event landing at revision 0", async () => {
    const result = await scheduleShow(makeDeps(), scheduleCmd("show-1", "A1", "A2"));

    const value = valueOf(result);
    expect(value.revision).toBe(0);
    expect(value.commitPosition.token).toBe("0");
  });

  it("passes a domain rejection through without appending", async () => {
    const deps = await withScheduledShow();

    const result = await scheduleShow(deps, scheduleCmd("show-1", "A1"));

    expect(result).toEqual({ ok: false, error: { type: "ShowAlreadyScheduled" } });
  });
});

describe("reserveSeats use case", () => {
  it("holds seats and returns the allocated holdId and new revision", async () => {
    const deps = await withScheduledShow();

    const result = await reserveSeats(deps, reserveCmd("show-1", "alice", "A1"));

    const value = valueOf(result);
    expect(value.holdId).toBe("hold-1");
    expect(value.revision).toBe(1);
    expect(value.commitPosition.token).toBe("1");
  });

  it("passes ShowNotFound through when the show was never scheduled", async () => {
    const result = await reserveSeats(makeDeps(), reserveCmd("show-1", "alice", "A1"));

    expect(result).toEqual({ ok: false, error: { type: "ShowNotFound" } });
  });

  it("passes a domain rejection (unknown seat) through", async () => {
    const deps = await withScheduledShow();

    const result = await reserveSeats(deps, reserveCmd("show-1", "alice", "Z9"));

    expect(result).toEqual({ ok: false, error: { type: "UnknownSeat", seatIds: ["Z9"] } });
  });
});

describe("confirmPurchase use case", () => {
  it("sells the seats of a live hold", async () => {
    const deps = await withScheduledShow();
    await reserveSeats(deps, reserveCmd("show-1", "alice", "A1")); // hold-1 at revision 1

    const result = await confirmPurchase(deps, confirmCmd("show-1", "hold-1"));

    const value = valueOf(result);
    expect(value.revision).toBe(2);
    expect(value.commitPosition.token).toBe("2");
  });

  it("passes HoldNotFound through for an unknown hold", async () => {
    const deps = await withScheduledShow();

    const result = await confirmPurchase(deps, confirmCmd("show-1", "ghost"));

    expect(result).toEqual({ ok: false, error: { type: "HoldNotFound" } });
  });
});

describe("releaseHold use case", () => {
  it("releases a live hold", async () => {
    const deps = await withScheduledShow();
    await reserveSeats(deps, reserveCmd("show-1", "alice", "A1"));

    const result = await releaseHold(deps, releaseCmd("show-1", "hold-1"));

    const value = valueOf(result);
    expect(value.revision).toBe(2);
    expect(value.commitPosition.token).toBe("2");
  });

  it("passes HoldNotFound through for an unknown hold", async () => {
    const deps = await withScheduledShow();

    const result = await releaseHold(deps, releaseCmd("show-1", "ghost"));

    expect(result).toEqual({ ok: false, error: { type: "HoldNotFound" } });
  });
});
