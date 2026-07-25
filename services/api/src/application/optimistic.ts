import type { DomainEventFact } from "@open-ticket/contracts";

import { reconstitute } from "../domain/index.ts";
import type { DomainError, ShowState } from "../domain/index.ts";

import { ConcurrencyError } from "./ports.ts";
import type { EventStore } from "./ports.ts";
import { conflict, rejectWith, succeed } from "./results.ts";
import type { UseCaseResult } from "./results.ts";

/** What a planned command wants to append, plus how to shape the success value from the new revision. */
export interface CommitPlan<T> {
  readonly events: readonly DomainEventFact[];
  readonly toValue: (revision: number) => T;
}

export type PlanResult<T> =
  | { readonly ok: true; readonly plan: CommitPlan<T> }
  | { readonly ok: false; readonly error: DomainError };

/**
 * The optimistic-concurrency loop (D1-05). Each attempt: read the stream → reconstitute state →
 * `plan` (decide) against it → append at the revision we read. A `ConcurrencyError` means the
 * stream moved under us, so re-read and retry; exhausting the budget surfaces a typed `Conflict`.
 * A domain rejection short-circuits without appending.
 *
 * `plan` re-runs on every attempt, so it re-reads the clock and re-decides against the latest
 * state — which is exactly how a racing reservation discovers, on its retry, that a seat it wanted
 * was just taken. Any non-`ConcurrencyError` throw is a genuine bug and propagates.
 */
export async function commitWithRetry<T>(
  store: EventStore,
  streamId: string,
  maxAttempts: number,
  plan: (state: ShowState) => PlanResult<T>,
): Promise<UseCaseResult<T>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const read = await store.readStream(streamId);
    const planned = plan(reconstitute(read.events));
    if (!planned.ok) return rejectWith(planned.error);

    try {
      const { revision } = await store.appendToStream(streamId, read.revision, planned.plan.events);
      return succeed(planned.plan.toValue(revision));
    } catch (error) {
      if (error instanceof ConcurrencyError) continue;
      throw error;
    }
  }
  return rejectWith(conflict);
}
