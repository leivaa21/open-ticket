import type {
  ConfirmPurchase,
  DomainEventFact,
  EpochMillis,
  HolderId,
  HoldId,
  ReleaseHold,
  ReserveSeats,
  ScheduleShow,
  SeatId,
  SeatIdList,
  ShowId,
} from "@open-ticket/contracts";

import { InMemoryEventStore } from "@api/contexts/ticketing/shared/infrastructure/in-memory-event-store.ts";
import type { Clock } from "@api/contexts/ticketing/shared/application/index.ts";

import type { IdGenerator } from "@api/contexts/ticketing/commands/application/ports.ts";
import type { UseCaseDeps } from "@api/contexts/ticketing/commands/application/use-cases.ts";

/**
 * Test-only builders and fakes for the application layer. The tests are the composition root, so
 * they wire real/adapters + fakes directly; branded ids are minted with casts (validation is a
 * PR1 edge concern, not the use case's). Not a `.test.ts`, so Vitest never runs it.
 */

export const showId = (id: string): ShowId => id as ShowId;
export const seat = (id: string): SeatId => id as SeatId;
export const seats = (...ids: string[]): SeatIdList => ids.map(seat) as SeatIdList;
export const holder = (id: string): HolderId => id as HolderId;
export const holdId = (id: string): HoldId => id as HoldId;

export const scheduleCmd = (show: string, ...seatNames: string[]): ScheduleShow => ({
  type: "ScheduleShow",
  showId: showId(show),
  seatIds: seats(...seatNames),
});
export const reserveCmd = (show: string, who: string, ...seatNames: string[]): ReserveSeats => ({
  type: "ReserveSeats",
  showId: showId(show),
  seatIds: seats(...seatNames),
  holderId: holder(who),
});
export const confirmCmd = (show: string, hold: string): ConfirmPurchase => ({
  type: "ConfirmPurchase",
  showId: showId(show),
  holdId: holdId(hold),
});
export const releaseCmd = (show: string, hold: string): ReleaseHold => ({
  type: "ReleaseHold",
  showId: showId(show),
  holdId: holdId(hold),
});

/** A raw SeatsHeld fact, for simulating a competing writer that moves the stream revision. */
export const heldFact = (
  hold: string,
  who: string,
  expiresAt: number,
  ...seatNames: string[]
): DomainEventFact => ({
  type: "SeatsHeld",
  payload: { holdId: holdId(hold), seatIds: seats(...seatNames), holderId: holder(who), expiresAt },
});

export class FixedClock implements Clock {
  constructor(private millis: number) {}
  now(): EpochMillis {
    return this.millis;
  }
  advanceTo(millis: number): void {
    this.millis = millis;
  }
}

/** Deterministic ids: hold-1, hold-2, … so tests can assert exact ids. */
export class SequentialIds implements IdGenerator {
  private issued = 0;
  nextHoldId(): HoldId {
    this.issued += 1;
    return holdId(`hold-${String(this.issued)}`);
  }
}

/**
 * An in-memory store on a fixed clock — the default for tests that don't care what `recordedAt`
 * says, only that it is deterministic.
 */
export const newStore = (clock: Clock = new FixedClock(1_000)): InMemoryEventStore =>
  new InMemoryEventStore(clock);

/** Assemble use-case deps with sensible defaults; override any port or policy per test. */
export function makeDeps(overrides: Partial<UseCaseDeps> = {}): UseCaseDeps {
  // One clock for the use cases AND the default store: the store stamps `recordedAt` from it, so
  // sharing keeps a test's event times on the same timeline its hold expiry is judged against.
  const clock = overrides.clock ?? new FixedClock(1_000);
  return {
    store: overrides.store ?? newStore(clock),
    clock,
    ids: overrides.ids ?? new SequentialIds(),
    holdTtlMs: overrides.holdTtlMs ?? 600_000,
    maxAttempts: overrides.maxAttempts ?? 3,
  };
}
