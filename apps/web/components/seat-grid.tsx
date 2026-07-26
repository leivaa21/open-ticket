"use client";

import type { SeatView } from "@open-ticket/contracts";
import { useEffect, useRef, useState } from "react";

import { ownershipOf, toRows } from "@/lib/seat-logic";
import type { Holds, SeatAction } from "@/lib/seat-logic";

interface SeatGridProps {
  seats: readonly SeatView[];
  holds: Holds;
  pending: ReadonlySet<string>;
  disabled: boolean;
  onAction: (seat: SeatView, action: SeatAction) => void;
}

/** The venue grid: a "stage" marker, then labelled rows of interactive seats. */
export function SeatGrid({ seats, holds, pending, disabled, onAction }: SeatGridProps) {
  const rows = toRows(seats);
  return (
    <div className="space-y-3">
      <div className="relative mx-auto mb-9 w-3/4">
        <div className="rounded-b-2xl border-x border-b border-line bg-gradient-to-b from-slate-700/40 to-transparent py-1.5 text-center text-[10px] uppercase tracking-[0.4em] text-slate-400">
          stage
        </div>
        <div
          className="absolute inset-x-6 top-full h-8 bg-gradient-to-b from-slate-500/10 to-transparent blur-md"
          aria-hidden
        />
      </div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-center gap-3.5">
          <span className="w-4 text-right font-mono text-[11px] text-slate-600">{row.label}</span>
          <div className="flex flex-wrap gap-2">
            {row.seats.map((seat) => (
              <SeatCell
                key={seat.seatId}
                seat={seat}
                ownership={ownershipOf(seat, holds)}
                pending={pending.has(seat.seatId)}
                disabled={disabled}
                onAction={onAction}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const BASE =
  "grid h-11 w-11 place-items-center rounded-lg border text-sm font-medium tabular-nums transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 select-none";

function SeatCell({
  seat,
  ownership,
  pending,
  disabled,
  onAction,
}: {
  seat: SeatView;
  ownership: "mine" | "other" | "none";
  pending: boolean;
  disabled: boolean;
  onAction: (seat: SeatView, action: SeatAction) => void;
}) {
  const flash = useFlash(`${seat.status}:${ownership}`);
  const flashClass = flash ? "seat-flash" : "";
  const pendingClass = pending ? "animate-pulse" : "";
  const number = seat.seatId.replace(/^\D+/, "") || seat.seatId;

  if (seat.status === "available") {
    return (
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => onAction(seat, "reserve")}
        aria-label={`Reserve seat ${seat.seatId}`}
        className={`${BASE} ${flashClass} ${pendingClass} cursor-pointer border-line bg-panel text-slate-300 hover:border-slate-400 hover:bg-slate-800 disabled:cursor-default`}
      >
        {number}
      </button>
    );
  }

  if (seat.status === "held" && ownership === "mine") {
    return (
      <div className="relative">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => onAction(seat, "confirm")}
          aria-label={`Confirm your hold on seat ${seat.seatId}`}
          className={`${BASE} ${flashClass} ${pendingClass} cursor-pointer border-mine bg-mine/15 text-mine hover:bg-mine/25`}
        >
          {number}
        </button>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => onAction(seat, "release")}
          aria-label={`Release your hold on seat ${seat.seatId}`}
          className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-canvas text-[11px] leading-none text-slate-400 hover:text-sold"
        >
          ×
        </button>
      </div>
    );
  }

  const soldish = seat.status === "sold";
  return (
    <div
      role="img"
      aria-label={`Seat ${seat.seatId} ${soldish ? "sold" : "held by someone else"}`}
      className={`${BASE} ${flashClass} cursor-not-allowed ${
        soldish ? "border-sold/50 bg-sold/15 text-sold" : "border-held/60 bg-held/15 text-held"
      }`}
    >
      {soldish ? <LockIcon /> : number}
    </div>
  );
}

/** Flash once whenever the key (status/ownership) changes — the live-update "pop". */
function useFlash(key: string): boolean {
  const previous = useRef(key);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    setFlashing(true);
    const timer = setTimeout(() => {
      setFlashing(false);
    }, 600);
    return () => {
      clearTimeout(timer);
    };
  }, [key]);
  return flashing;
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
