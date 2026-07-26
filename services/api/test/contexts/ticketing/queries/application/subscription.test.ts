import { describe, expect, it } from "vitest";

import type { GlobalEvent } from "@api/contexts/ticketing/queries/application/event-log.ts";
import { FakeLog, gatedHandler } from "./subscription.fixtures.ts";
import { subscribe } from "@api/contexts/ticketing/queries/application/subscription.ts";

describe("subscribe — catch-up (D2-03)", () => {
  it("replays all historical events from position 0 in order", async () => {
    const log = new FakeLog();
    log.seed(3);
    const applied: number[] = [];

    const sub = subscribe({
      log,
      from: 0,
      handler: (event) => void applied.push(event.globalPosition),
    });
    await sub.settled();

    expect(applied).toEqual([0, 1, 2]);
    expect(sub.position).toBe(3);
    sub.stop();
  });

  it("replays from a mid position, skipping earlier events", async () => {
    const log = new FakeLog();
    log.seed(5);
    const applied: number[] = [];

    const sub = subscribe({
      log,
      from: 2,
      handler: (event) => void applied.push(event.globalPosition),
    });
    await sub.settled();

    expect(applied).toEqual([2, 3, 4]);
    expect(sub.position).toBe(5);
    sub.stop();
  });
});

describe("subscribe — live delivery and lag (D2-03)", () => {
  it("delivers a commit that arrives after catch-up", async () => {
    const log = new FakeLog(); // empty
    const applied: number[] = [];
    const sub = subscribe({
      log,
      from: 0,
      handler: (event) => void applied.push(event.globalPosition),
    });
    await sub.settled();
    expect(applied).toEqual([]);

    log.commit(); // event 0 arrives live
    await sub.settled();

    expect(applied).toEqual([0]);
    expect(sub.position).toBe(1);
    sub.stop();
  });

  it("tracks position and lag = head − position", async () => {
    const log = new FakeLog();
    log.seed(5); // head 5
    const gate = gatedHandler(2);

    const sub = subscribe({ log, from: 0, handler: gate.handler });
    await gate.reached; // paused mid-apply of event 2 — 0 and 1 are done

    expect(sub.position).toBe(2);
    expect(await sub.lag()).toBe(3); // 5 − 2

    gate.release();
    await sub.settled();
    expect(sub.position).toBe(5);
    expect(await sub.lag()).toBe(0);
    sub.stop();
  });
});

describe("subscribe — serialized, coalescing pump (D2-03)", () => {
  it("coalesces a burst during an in-flight batch into ONE follow-up pass, never overlapping", async () => {
    const log = new FakeLog();
    log.seed(1); // event 0
    const gate = gatedHandler(0); // pause while applying event 0

    const sub = subscribe({ log, from: 0, handler: gate.handler });
    await gate.reached; // catch-up is applying event 0 and is now paused

    // Two commits land while the batch is in flight.
    log.commit(); // event 1
    log.commit(); // event 2
    gate.release();
    await sub.settled();

    expect(gate.applied).toEqual([0, 1, 2]); // nothing dropped, in order
    expect(gate.maxActive()).toBe(1); // never two handlers at once (serialized)
    expect(log.readAllCalls).toBe(2); // one catch-up pass + one coalesced follow-up (not 3)
    expect(sub.position).toBe(3);
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
      if (event.globalPosition === 0) throw boom;
    };

    const sub = subscribe({ log, from: 0, handler });
    await sub.settled();

    expect(sub.failed()).toBe(boom);
    expect(calls).toBe(1); // stopped after the throwing event; event 1 never applied
    expect(sub.position).toBe(0); // did not advance past the failure

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
      from: 0,
      handler: (event) => void applied.push(event.globalPosition),
    });
    await sub.settled();
    expect(applied).toEqual([0]);

    sub.stop();
    log.commit(); // event 1
    await sub.settled();

    expect(applied).toEqual([0]); // nothing delivered after stop
  });
});
