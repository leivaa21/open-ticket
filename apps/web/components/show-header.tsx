import type { SeatMapView } from "@open-ticket/contracts";

import { countByStatus } from "@/lib/seat-logic";

/**
 * The show header: title, short show id, a pulsing live/asOf indicator (the projection position
 * the map reflects), and availability counts. `asOf` advancing as seats change is the visible
 * "eventually consistent, catching up" signal.
 */
export function ShowHeader({
  showId,
  view,
  live,
}: {
  showId: string;
  view: SeatMapView;
  live: boolean;
}) {
  const counts = countByStatus(view.seats);
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-100">
          open-ticket <span className="font-normal text-slate-500">· live seat map</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">show {showId.slice(0, 8)}</p>
      </div>

      <div className="flex items-center gap-5 text-sm">
        <span className="flex items-center gap-2 text-slate-400">
          <span
            className={`live-dot inline-block h-2 w-2 rounded-full ${live ? "bg-mine" : "bg-slate-600"}`}
            aria-hidden
          />
          {live ? "live" : "connecting…"}
          <span className="font-mono text-xs text-slate-600">asOf {view.asOf}</span>
        </span>
        <span className="text-slate-400">
          <span className="font-semibold text-slate-200">{counts.available}</span> available ·{" "}
          <span className="font-semibold text-held">{counts.held}</span> held ·{" "}
          <span className="font-semibold text-sold">{counts.sold}</span> sold
        </span>
      </div>
    </header>
  );
}
