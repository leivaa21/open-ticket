import type { DevAppended, DevLag } from "@open-ticket/contracts";

import { API_URL } from "./config.ts";
import { browserEventSource } from "./sse.ts";
import type { EventSourceFactory } from "./sse.ts";

/**
 * The dashboard SSE client — mirrors `lib/sse.ts`, extracted from React so it's testable without a
 * DOM. `subscribeDevStream` opens `/dev/stream`, parses `appended`/`lag` frames into the shared
 * contracts DTOs, forwards them, and returns an unsubscribe that closes the source.
 */
export interface SubscribeDevStreamOptions {
  onAppended: (event: DevAppended) => void;
  onLag: (lag: DevLag) => void;
  onError?: () => void;
  url?: string;
  eventSourceFactory?: EventSourceFactory;
}

export function devStreamUrl(): string {
  return `${API_URL}/dev/stream`;
}

export function parseAppended(raw: string): DevAppended | undefined {
  const value = parseJson(raw);
  if (value === undefined) return undefined;
  return typeof value.position === "number" &&
    typeof value.type === "string" &&
    typeof value.showId === "string"
    ? { position: value.position, type: value.type, showId: value.showId }
    : undefined;
}

export function parseLag(raw: string): DevLag | undefined {
  const value = parseJson(raw);
  if (value === undefined) return undefined;
  return typeof value.head === "number" &&
    typeof value.asOf === "number" &&
    typeof value.behind === "number"
    ? { head: value.head, asOf: value.asOf, behind: value.behind }
    : undefined;
}

export function subscribeDevStream(options: SubscribeDevStreamOptions): () => void {
  const factory = options.eventSourceFactory ?? browserEventSource;
  const source = factory(options.url ?? devStreamUrl());

  source.addEventListener("appended", (event) => {
    const appended = parseAppended(event.data);
    if (appended !== undefined) options.onAppended(appended);
  });
  source.addEventListener("lag", (event) => {
    const lag = parseLag(event.data);
    if (lag !== undefined) options.onLag(lag);
  });
  if (options.onError !== undefined) {
    source.addEventListener("error", options.onError);
  }

  return () => {
    source.close();
  };
}

function parseJson(raw: string): Record<string, unknown> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
