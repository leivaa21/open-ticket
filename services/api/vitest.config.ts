import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  // Tests live under test/ (mirroring src/) and import production code via the @api alias, so
  // src/ stays production-only. Mirrors the tsconfig `@api/*` → `src/*` path mapping.
  resolve: {
    alias: {
      "@api": `${import.meta.dirname}/src`,
    },
  },
});
