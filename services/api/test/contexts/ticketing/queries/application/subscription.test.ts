import { describe, expect, it } from "vitest";

import type { GlobalEvent } from "@api/contexts/ticketing/queries/application/event-log.ts";
import { subscribe } from "@api/contexts/ticketing/queries/application/subscription.ts";
import { LogPosition } from "@api/contexts/ticketing/shared/infrastructure/log-position.ts";
import { appliedIndex, FakeLog, gatedHandler } from "./subscription.fixtures.ts";

/** The index of the event a handler was just handed — positions are opaque outside the adapter. */
const indexOf = (event: GlobalEvent): number => appliedIndex(event.position) ?? -1;

describe("subscribe — catch-up (D2-03)", () => {
  it("replays the whole log in order when started from null", async () => {
    const log = new FakeLog();
    log.seed(3);
    const applied: number[] = [];

    const sub = subscribe({
      log,
      from: null,
      handler: (event) => void applied.push(indexOf(event)),
    });
    await sub.settled();

    expect(applied).toEqual([0, 1, 2]);
    expect(appliedIndex(sub.position)).toBe(2); // the LAST applied position, not the next to read
    sub.stop();
  });

  it("resumes strictly AFTER the given position, skipping it and everything before", async () => {
    const log = new FakeLog();
    log.seed(5);
    const applied: number[] = [];

    // Exclusive by design (D4-01): an opaque position has no successor, so a resuming reader can
    // only say "after the last one I applied" — event 1 here is already applied and must not repeat.
    const sub = subscribe({
      log,
      from: new LogPosition(1),
      handler: (event) => void applied.push(indexOf(event)),
    });
    await sub.settled();

    expect(applied).toEqual([2, 3, 4]);
    expect(appliedIndex(sub.position)).toBe(4);
    sub.stop();
  });
});

describe("subscribe — live delivery and lag (D2-03)", () => {
  it("delivers a commit that arrives after catch-up", async () => {
    const log = new FakeLog(); // empty
    const applied: number[] = [];
    const sub = subscribe({
      log,
      from: null,
      handler: (event) => void applied.push(indexOf(event)),
    });
    await sub.settled();
    expect(applied).toEqual([]);
    expect(sub.position).toBeNull(); // nothing applied yet — not "position 0"

    log.commit(); // event 0 arrives live
    await sub.settled();

    expect(applied).toEqual([0]);
    expect(appliedIndex(sub.position)).toBe(0);
    sub.stop();
  });

  it("leaves the log able to count what is still unapplied from the subscription's position", async () => {
    const log = new FakeLog();
    log.seed(5);
    const gate = gatedHandler(2);

    const sub = subscribe({ log, from: null, handler: gate.handler });
    await gate.reached; // paused mid-apply of event 2 — 0 and 1 are done

    expect(appliedIndex(sub.position)).toBe(1);
    // `behindEvents` is the store's optional courtesy (D4-01), computed from a position it owns —
    // the subscription itself no longer claims to know how many events "behind" means.
    expect(log.behindEvents(sub.position)).toBe(3); // events 2, 3, 4

    gate.release();
    await sub.settled();
    expect(appliedIndex(sub.position)).toBe(4);
    expect(log.behindEvents(sub.position)).toBe(0);
    sub.stop();
  });
});

describe("subscribe — serialized, coalescing pump (D2-03)", () => {
  it("coalesces a burst during an in-flight batch into ONE follow-up pass, never overlapping", async () => {
    const log = new FakeLog();
    log.seed(1); // event 0
    const gate = gatedHandler(0); // pause while applying event 0

    const sub = subscribe({ log, from: null, handler: gate.handler });
    await gate.reached; // catch-up is applying event 0 and is now paused

    // Two commits land while the batch is in flight.
    log.commit(); // event 1
    log.commit(); // event 2
    gate.release();
    await sub.settled();

    expect(gate.applied).toEqual([0, 1, 2]); // nothing dropped, in order
    expect(gate.maxActive()).toBe(1); // never two handlers at once (serialized)
    expect(log.readAllCalls).toBe(2); // one catch-up pass + one coalesced follow-up (not 3)
    expect(appliedIndex(sub.position)).toBe(2);
    sub.stop();
  });
});

describe("subscribe — handler errors and stop (D2-03)", () => {
  it("stops on a handler throw and surfaces it via failed(), without advancing past it", async () => {
    const log = new FakeLog();
    log.seed(2);
    const boom = new Error("projection bug");
    let calls = 0;
    const handler = (event: GlobalEvent): void => {
      calls += 1;
      if (indexOf(event) === 0) throw boom;
    };

    const sub = subscribe({ log, from: null, handler });
    await sub.settled();

    expect(sub.failed()).toBe(boom);
    expect(calls).toBe(1); // stopped after the throwing event; event 1 never applied
    expect(sub.position).toBeNull(); // did not advance past the failure

    log.commit(); // a later commit is not delivered — the subscription is stopped
    await sub.settled();
    expect(calls).toBe(1);
  });

  it("stop() halts delivery of subsequent commits", async () => {
    const log = new FakeLog();
    log.seed(1);
    const applied: number[] = [];
    const sub = subscribe({
      log,
      from: null,
      handler: (event) => void applied.push(indexOf(event)),
    });
    await sub.settled();
    expect(applied).toEqual([0]);

    sub.stop();
    log.commit(); // event 1
    await sub.settled();

    expect(applied).toEqual([0]); // nothing delivered after stop
  });
});
