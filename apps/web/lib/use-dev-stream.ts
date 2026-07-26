import type { DevAppended, DevLag } from "@open-ticket/contracts";
import { useEffect, useState } from "react";

import { pushEvent } from "./dev-model.ts";
import { subscribeDevStream } from "./dev-stream.ts";

const DEFAULT_MAX_EVENTS = 50;

/**
 * Subscribes to `/dev/stream` and keeps a bounded rolling buffer of recent appended events (newest
 * first) plus the latest lag snapshot. `connected` flips true once any frame arrives, false on
 * error (the EventSource auto-reconnects). Cleanup closes the stream on unmount.
 */
export function useDevStream(maxEvents: number = DEFAULT_MAX_EVENTS): {
  events: readonly DevAppended[];
  lag: DevLag | null;
  connected: boolean;
} {
  const [events, setEvents] = useState<readonly DevAppended[]>([]);
  const [lag, setLag] = useState<DevLag | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(
    () =>
      subscribeDevStream({
        onAppended: (event) => {
          setEvents((buffer) => pushEvent(buffer, event, maxEvents));
          setConnected(true);
        },
        onLag: (next) => {
          setLag(next);
          setConnected(true);
        },
        onError: () => {
          setConnected(false);
        },
      }),
    [maxEvents],
  );

  return { events, lag, connected };
}
