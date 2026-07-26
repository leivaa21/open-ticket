import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // apps/web has its own (React/Next) flat config, run via the web package's own `lint` script
  // (wired into the root `pnpm lint`). The backend's strictTypeChecked rules don't suit React.
  { ignores: ["**/dist/**", "**/.turbo/**", "**/node_modules/**", "apps/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
