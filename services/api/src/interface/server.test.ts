import { describe, expect, it } from "vitest";

import { buildServer } from "./server.ts";

describe("server", () => {
  it("answers the health probe without touching the network", async () => {
    const server = buildServer();

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
