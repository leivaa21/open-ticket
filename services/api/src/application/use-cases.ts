import type {
  ConfirmPurchase,
  HoldId,
  ReleaseHold,
  ReserveSeats,
  ScheduleShow,
} from "@open-ticket/contracts";

import { decide } from "../domain/index.ts";
import type { DecideResult } from "../domain/index.ts";

import { commitWithRetry } from "./optimistic.ts";
import type { PlanResult } from "./optimistic.ts";
import type { Clock, EventStore, IdGenerator } from "./ports.ts";
import type { UseCaseResult } from "./results.ts";

/** The ports and policy a use case needs. Composed once at the edge (PR4); tests pass fakes. */
export interface UseCaseDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly holdTtlMs: number;
  readonly maxAttempts: number;
}

export interface CommitOutcome {
  readonly revision: number;
}
export interface ReserveOutcome extends CommitOutcome {
  readonly holdId: HoldId;
}

/** streamId = showId — one stream per show (the per-show consistency boundary). */
export function scheduleShow(
  deps: UseCaseDeps,
  command: ScheduleShow,
): Promise<UseCaseResult<CommitOutcome>> {
  return commitWithRetry(deps.store, command.showId, deps.maxAttempts, (state) =>
    toPlan(decide(state, command, { now: deps.clock.now() }), toRevision),
  );
}

export function reserveSeats(
  deps: UseCaseDeps,
  command: ReserveSeats,
): Promise<UseCaseResult<ReserveOutcome>> {
  // The holdId is allocated ONCE and reused across retries — it is the stable identity of this
  // reservation. A conflicted attempt persists nothing, so reuse is safe (nothing to collide with),
  // it keeps the returned id and any future idempotency key stable, and it avoids burning ids on
  // contention. Only `now`/`expiresAt` refresh each attempt, so the TTL is measured from the actual
  // successful commit, not the first try. (A real store's ambiguous-append edge — reading back your
  // own write on retry — is an M4 idempotency-key concern; the in-memory append here is atomic.)
  const holdId = deps.ids.nextHoldId();
  return commitWithRetry(deps.store, command.showId, deps.maxAttempts, (state) => {
    const now = deps.clock.now();
    const result = decide(state, command, {
      now,
      newHold: { holdId, expiresAt: now + deps.holdTtlMs },
    });
    return toPlan(result, (revision) => ({ holdId, revision }));
  });
}

export function confirmPurchase(
  deps: UseCaseDeps,
  command: ConfirmPurchase,
): Promise<UseCaseResult<CommitOutcome>> {
  return commitWithRetry(deps.store, command.showId, deps.maxAttempts, (state) =>
    toPlan(decide(state, command, { now: deps.clock.now() }), toRevision),
  );
}

export function releaseHold(
  deps: UseCaseDeps,
  command: ReleaseHold,
): Promise<UseCaseResult<CommitOutcome>> {
  return commitWithRetry(deps.store, command.showId, deps.maxAttempts, (state) =>
    toPlan(decide(state, command, { now: deps.clock.now() }), toRevision),
  );
}

/** Bridge a domain `DecideResult` into an optimistic-loop `PlanResult` with a value factory. */
function toPlan<T>(result: DecideResult, toValue: (revision: number) => T): PlanResult<T> {
  return result.ok
    ? { ok: true, plan: { events: result.events, toValue } }
    : { ok: false, error: result.error };
}

const toRevision = (revision: number): CommitOutcome => ({ revision });
