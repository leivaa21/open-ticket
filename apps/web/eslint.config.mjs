import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * The web app's own lint config (wired into the root `pnpm lint`). Uses typescript-eslint's
 * non-type-checked `recommended` — the backend's `strictTypeChecked` fights idiomatic React
 * (async handlers, effect deps) — plus React-Hooks and Next's rules, then Prettier last.
 */
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  prettier,
);
