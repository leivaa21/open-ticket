import type { SeatMapView } from "@open-ticket/contracts";

import { API_URL } from "./config.ts";

/**
 * The SSE wiring, extracted from React so it's testable without a DOM. `subscribeSeatMap` opens an
 * `EventSource` (injectable for tests), forwards each parsed `seatmap` frame, and returns an
 * unsubscribe that closes the stream — exactly what the hook's `useEffect` cleanup calls on unmount.
 */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

const browserEventSource: EventSourceFactory = (url) =>
  new EventSource(url) as unknown as EventSourceLike;

export function seatStreamUrl(showId: string): string {
  return `${API_URL}/shows/${encodeURIComponent(showId)}/seats/stream`;
}

export function parseSeatMapView(raw: string): SeatMapView | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return isSeatMapView(value) ? value : undefined;
}

export function subscribeSeatMap(
  showId: string,
  onFrame: (view: SeatMapView) => void,
  onError: () => void,
  factory: EventSourceFactory = browserEventSource,
): () => void {
  const source = factory(seatStreamUrl(showId));
  source.addEventListener("seatmap", (event) => {
    const view = parseSeatMapView(event.data);
    if (view !== undefined) onFrame(view);
  });
  source.addEventListener("error", () => {
    onError();
  });
  return () => {
    source.close();
  };
}

function isSeatMapView(value: unknown): value is SeatMapView {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.showId === "string" &&
    typeof record.asOf === "number" &&
    Array.isArray(record.seats)
  );
}
