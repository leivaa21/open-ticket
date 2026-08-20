import type { PositionToken, SeatMapView } from "@open-ticket/contracts";

import { API_URL } from "./config.ts";

/**
 * The typed API client — the only thing that talks to the API. Every call returns a discriminated
 * `ApiResult` (never throws for an expected outcome like a 409), so the UI reacts to typed errors.
 * Reuses the contracts `SeatMapView` for reads; command responses (`commitPosition`, `holdId`) are
 * API-specific shapes typed locally. A `commitPosition` is an opaque token (D4-01): the app may
 * hold it and echo it back, but it cannot order two of them — only the server can.
 */

export interface ApiError {
  readonly status: number;
  readonly type: string;
  readonly seatIds?: readonly string[];
}
export type ApiResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

export interface CreatedShow {
  readonly showId: string;
  readonly commitPosition: PositionToken;
}
export interface Reserved {
  readonly holdId: string;
  readonly commitPosition: PositionToken;
}
export interface Committed {
  readonly commitPosition: PositionToken;
}

const showsPath = (showId: string): string => `/shows/${encodeURIComponent(showId)}`;

export type ProjectionHealth = "healthy" | "degraded" | "unknown";

/** Reads `/health`: `unknown` on a network error, `degraded` if the projection is dead (503). */
export async function checkHealth(): Promise<ProjectionHealth> {
  try {
    const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
    const body = asRecord(await response.json().catch(() => undefined));
    return body?.projection === "healthy" ? "healthy" : "degraded";
  } catch {
    return "unknown";
  }
}

/** Server-side (RSC) initial fetch — always fresh, never cached, so first paint reflects `asOf`. */
export function getSeatMap(showId: string): Promise<ApiResult<SeatMapView>> {
  return send(`${showsPath(showId)}/seats`, { cache: "no-store" }, asSeatMapView);
}

export function createShow(seatIds: readonly string[]): Promise<ApiResult<CreatedShow>> {
  return send("/shows", jsonInit("POST", { seatIds }), (json) => {
    const record = asRecord(json);
    return record && typeof record.showId === "string" && typeof record.commitPosition === "string"
      ? { showId: record.showId, commitPosition: record.commitPosition }
      : undefined;
  });
}

export function reserveSeats(
  showId: string,
  seatIds: readonly string[],
  holderId: string,
): Promise<ApiResult<Reserved>> {
  return send(
    `${showsPath(showId)}/reservations`,
    jsonInit("POST", { seatIds, holderId }),
    (json) => {
      const record = asRecord(json);
      return record &&
        typeof record.holdId === "string" &&
        typeof record.commitPosition === "string"
        ? { holdId: record.holdId, commitPosition: record.commitPosition }
        : undefined;
    },
  );
}

export function confirmHold(showId: string, holdId: string): Promise<ApiResult<Committed>> {
  const path = `${showsPath(showId)}/reservations/${encodeURIComponent(holdId)}/confirmation`;
  return send(path, jsonInit("POST", {}), asCommitted);
}

export function releaseHold(showId: string, holdId: string): Promise<ApiResult<Committed>> {
  const path = `${showsPath(showId)}/reservations/${encodeURIComponent(holdId)}`;
  return send(path, { method: "DELETE" }, asCommitted);
}

async function send<T>(
  path: string,
  init: RequestInit,
  extract: (json: unknown) => T | undefined,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    return { ok: false, error: { status: 0, type: "NetworkError" } };
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) return { ok: false, error: toApiError(response.status, json) };
  const value = extract(json);
  return value === undefined
    ? { ok: false, error: { status: response.status, type: "MalformedResponse" } }
    : { ok: true, value };
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * A position token, or `null` for "nothing projected yet". Shape only — the contents are opaque
 * by contract (D4-01), so there is nothing else here we are entitled to check.
 */
function isAsOf(value: unknown): value is PositionToken | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

function asRecord(json: unknown): Record<string, unknown> | undefined {
  return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : undefined;
}

function asCommitted(json: unknown): Committed | undefined {
  const record = asRecord(json);
  return record && typeof record.commitPosition === "string"
    ? { commitPosition: record.commitPosition }
    : undefined;
}

function asSeatMapView(json: unknown): SeatMapView | undefined {
  const record = asRecord(json);
  if (!record || typeof record.showId !== "string" || !isAsOf(record.asOf)) return undefined;
  if (!Array.isArray(record.seats)) return undefined;
  return record as unknown as SeatMapView;
}

function toApiError(status: number, json: unknown): ApiError {
  const error = asRecord(asRecord(json)?.error);
  const type = typeof error?.type === "string" ? error.type : "Error";
  const seatIds = Array.isArray(error?.seatIds)
    ? error.seatIds.filter((seat): seat is string => typeof seat === "string")
    : undefined;
  return seatIds ? { status, type, seatIds } : { status, type };
}
