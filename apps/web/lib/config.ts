/**
 * Typed runtime config — the one place `process.env` is read. `NEXT_PUBLIC_API_URL` is inlined by
 * Next at build time and is safe on the client (it's just the public API origin). Default targets
 * the API's dev port (5210). The API must allow this app's origin via CORS (`WEB_ORIGIN`).
 */
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5210";
