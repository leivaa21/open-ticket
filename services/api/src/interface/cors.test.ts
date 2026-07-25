import { describe, expect, it } from "vitest";

import { buildTestServer, TEST_WEB_ORIGIN } from "./test-server.ts";

const acao = (headers: Record<string, unknown>): unknown => headers["access-control-allow-origin"];

describe("CORS — restricted to WEB_ORIGIN, never a wildcard (D3-05)", () => {
  it("reflects ACAO for the allowed origin", async () => {
    const { server } = buildTestServer();

    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: TEST_WEB_ORIGIN },
    });

    expect(acao(response.headers)).toBe(TEST_WEB_ORIGIN);
  });

  it("does not grant ACAO to a disallowed origin", async () => {
    const { server } = buildTestServer();

    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://evil.example" },
    });

    expect(acao(response.headers)).toBeUndefined();
  });

  it("never returns a wildcard ACAO", async () => {
    const { server } = buildTestServer();

    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: TEST_WEB_ORIGIN },
    });

    expect(acao(response.headers)).not.toBe("*");
  });
});
