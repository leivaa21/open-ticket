"use client";

import type { SeatMapView, SeatView } from "@open-ticket/contracts";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { SeatGrid } from "@/components/seat-grid";
import { ShowHeader } from "@/components/show-header";
import { StatusLegend } from "@/components/status-legend";
import { confirmHold, releaseHold, reserveSeats } from "@/lib/api";
import { holdGone, pruneHolds } from "@/lib/seat-logic";
import type { Holds, SeatAction } from "@/lib/seat-logic";
import { useHolderId } from "@/lib/use-holder-id";
import { useSeatMap } from "@/lib/use-seat-map";

/**
 * The interactive seat map (D3-01). Hydrated from the server-rendered `initial` view, it subscribes
 * to the seat SSE for authoritative live updates, and lets you reserve an available seat / confirm
 * or release your own hold. It never optimistically flips a seat — the SSE frame is the source of
 * truth, so two tabs racing the same seat converge: one gets 201, the other a 409 and sees it held.
 */
export function SeatMapClient({ showId, initial }: { showId: string; initial: SeatMapView }) {
  const { view, live } = useSeatMap(showId, initial);
  const holderId = useHolderId();
  const [rawHolds, setRawHolds] = useState<Holds>(() => new Map());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState("");

  // Derived, always-honest ownership: my holds intersected with what's actually held right now.
  const holds = useMemo(() => pruneHolds(rawHolds, view.seats), [rawHolds, view.seats]);

  const notify = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => {
      setFeedback("");
    }, 2500);
  }, []);

  // Forget a hold locally — on release, or when the server says it's gone (expired/unknown).
  const dropHold = useCallback((seatId: string) => {
    setRawHolds((held) => {
      if (!held.has(seatId)) return held;
      const next = new Map(held);
      next.delete(seatId);
      return next;
    });
  }, []);

  const onAction = useCallback(
    async (seat: SeatView, action: SeatAction) => {
      if (holderId === "") return;
      const seatId = seat.seatId;
      setPending((prev) => new Set(prev).add(seatId));
      try {
        if (action === "reserve") {
          const result = await reserveSeats(showId, [seatId], holderId);
          if (result.ok) setRawHolds((held) => new Map(held).set(seatId, result.value.holdId));
          else notify(reserveMessage(seatId, result.error.type));
        } else if (action === "confirm") {
          const holdId = holds.get(seatId);
          if (holdId !== undefined) {
            const result = await confirmHold(showId, holdId);
            if (!result.ok) {
              if (holdGone(result.error.status)) dropHold(seatId); // clear the stale affordance
              notify(`Couldn't confirm ${seatId} — it may have expired`);
            }
          }
        } else {
          const holdId = holds.get(seatId);
          if (holdId !== undefined) {
            const result = await releaseHold(showId, holdId);
            if (result.ok || holdGone(result.error.status)) dropHold(seatId);
            else notify(`Couldn't release ${seatId}`);
          }
        }
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(seatId);
          return next;
        });
      }
    },
    [showId, holderId, holds, notify, dropHold],
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <ShowHeader showId={showId} view={view} live={live} />

      <div className="mt-9">
        <SeatGrid
          seats={view.seats}
          holds={holds}
          pending={pending}
          disabled={holderId === ""}
          onAction={onAction}
        />
      </div>

      <div className="mt-9 flex items-center justify-between">
        <StatusLegend />
        <Link href="/" className="text-xs text-slate-500 transition-colors hover:text-slate-300">
          + new show
        </Link>
      </div>

      {feedback !== "" && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-held/50 bg-panel px-4 py-2 text-sm text-held shadow-lg"
        >
          {feedback}
        </div>
      )}
    </main>
  );
}

function reserveMessage(seatId: string, errorType: string): string {
  if (errorType === "SeatsUnavailable") return `Seat ${seatId} was just taken`;
  if (errorType === "NetworkError") return "Can't reach the server";
  return `Couldn't reserve ${seatId}`;
}
