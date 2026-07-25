import { loadConfig } from "./config.ts";
import { buildApp } from "./interface/app.ts";

const config = loadConfig();
const server = buildApp(config);

try {
  await server.listen({ port: config.PORT, host: config.HOST });
  process.stdout.write(
    `open-ticket api listening on http://${config.HOST}:${String(config.PORT)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
