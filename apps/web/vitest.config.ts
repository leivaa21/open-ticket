import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The web's tests are pure logic (seat rules + SSE wiring) — no DOM rendering, so node env.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
