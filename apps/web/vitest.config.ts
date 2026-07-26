import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The web's tests are pure logic (seat rules + SSE wiring) — no DOM rendering, so node env.
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  // Tests live under test/ and import production code via the @ alias (matching tsconfig `@/*`).
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
});
