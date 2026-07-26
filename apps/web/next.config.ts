import type { NextConfig } from "next";

/**
 * `transpilePackages` lets the app consume `@open-ticket/contracts` straight from source (D3-04),
 * so the read DTO shapes are never re-declared — the same types the API produces.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@open-ticket/contracts"],
};

export default nextConfig;
