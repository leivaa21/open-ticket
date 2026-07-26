import { randomUUID } from "node:crypto";

import { HoldId } from "@open-ticket/contracts";
import type { EpochMillis } from "@open-ticket/contracts";

import type { Clock } from "../application/index.ts";
import type { IdGenerator } from "../../commands/application/ports.ts";

/** Production `Clock` — wall-clock epoch millis. */
export class SystemClock implements Clock {
  now(): EpochMillis {
    return Date.now();
  }
}

/** Production `IdGenerator` — a v4 UUID, branded through the contract schema (D1-07). */
export class UuidGenerator implements IdGenerator {
  nextHoldId(): HoldId {
    return HoldId.parse(randomUUID());
  }
}
