import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  // Bundle the workspace contracts (consumed as source) into the output.
  noExternal: ["@open-ticket/contracts"],
});
