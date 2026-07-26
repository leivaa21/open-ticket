/**
 * Small request helper shared by the command controllers. Never trust `request.body`'s shape — a
 * JSON object becomes a record, anything else (array, primitive, null) becomes an empty one — so a
 * handler can spread it before parsing the result against the contract schema at the edge.
 */
export function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
