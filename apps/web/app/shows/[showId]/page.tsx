import Link from "next/link";

import { getSeatMap } from "@/lib/api";

import { SeatMapClient } from "./seat-map-client";

/**
 * Server Component: fetches the initial `SeatMapView` so first paint is correct (SSR), then hands
 * off to the client map for live SSE updates + interactivity. A show the projection hasn't seen
 * yet reads 404 → an honest "not visible yet" state (D2-05), not a hard error.
 */
export default async function ShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const result = await getSeatMap(showId);

  if (!result.ok) {
    return <ShowUnavailable showId={showId} status={result.error.status} />;
  }
  return <SeatMapClient showId={showId} initial={result.value} />;
}

function ShowUnavailable({ showId, status }: { showId: string; status: number }) {
  const notYet = status === 404;
  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-5 text-center">
      <div>
        <p className="font-mono text-xs text-slate-600">show {showId.slice(0, 8)}</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-100">
          {notYet ? "Not visible yet" : "Show unavailable"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {notYet
            ? "This show hasn't been projected yet, or doesn't exist."
            : status === 503
              ? "The read projection is unavailable right now."
              : "Couldn't reach the show."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-line bg-panel px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500"
        >
          Create a show
        </Link>
      </div>
    </main>
  );
}
