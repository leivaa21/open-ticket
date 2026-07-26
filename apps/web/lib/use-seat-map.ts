import type { SeatMapView } from "@open-ticket/contracts";
import { useEffect, useState } from "react";

import { subscribeSeatMap } from "./sse.ts";

/**
 * Subscribes to the per-show seat SSE and keeps the latest `SeatMapView`. Each frame is a full
 * snapshot, so state is simply replaced (authoritative). `live` tracks whether the stream is
 * currently connected. Cleanup closes the stream on unmount / show change (see `subscribeSeatMap`).
 *
 * `live` starts `true`: the `initial` view is server-rendered fresh (its `asOf` is current at
 * load), so the first paint honestly reflects live state; a real stream error flips it to false
 * (the header then reads "reconnecting…") until the next frame restores it.
 */
export function useSeatMap(
  showId: string,
  initial: SeatMapView,
): { view: SeatMapView; live: boolean } {
  const [view, setView] = useState(initial);
  const [live, setLive] = useState(true);

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
