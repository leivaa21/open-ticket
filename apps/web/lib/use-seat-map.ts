import type { SeatMapView } from "@open-ticket/contracts";
import { useEffect, useState } from "react";

import { subscribeSeatMap } from "./sse.ts";

/**
 * Subscribes to the per-show seat SSE and keeps the latest `SeatMapView`. Each frame is a full
 * snapshot, so state is simply replaced (authoritative). `live` tracks whether the stream is
 * currently connected. Cleanup closes the stream on unmount / show change (see `subscribeSeatMap`).
 */
export function useSeatMap(
  showId: string,
  initial: SeatMapView,
): { view: SeatMapView; live: boolean } {
  const [view, setView] = useState(initial);
  const [live, setLive] = useState(false);

  useEffect(
    () =>
      subscribeSeatMap(
        showId,
        (next) => {
          setView(next);
          setLive(true);
        },
        () => {
          setLive(false); // EventSource auto-reconnects; the next frame flips this back
        },
      ),
    [showId],
  );

  return { view, live };
}
