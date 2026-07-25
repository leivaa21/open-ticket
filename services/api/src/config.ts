import { z } from "zod";

/**
 * Typed, validated configuration read once at the edge. Every env var is parsed here — nothing
 * downstream reads `process.env`. Defaults keep the API runnable with zero setup in dev.
 */
const ConfigSchema = z.object({
  // Port scheme 5·P·S·V — project index 2, backend side 1, first variant 0 → 5210.
  PORT: z.coerce.number().int().min(1).max(65535).default(5210),
  HOST: z.string().default("127.0.0.1"),
  // How long a seat hold lives before lazy expiry frees its seats (D1-03). Single source of the
  // TTL — the reserve use case reads it from here, never hardcoded.
  HOLD_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60 * 1000),
  // Optimistic-append retry budget under contention (D1-05) before surfacing a typed conflict.
  MAX_APPEND_ATTEMPTS: z.coerce.number().int().min(1).default(3),
});

export type Config = Readonly<z.infer<typeof ConfigSchema>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
