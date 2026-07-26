"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createShow } from "@/lib/api";

/** Generate venue seat ids: rows A, B, C… each numbered 1..perRow. */
function generateSeatIds(rows: number, perRow: number): string[] {
  const ids: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const letter = String.fromCharCode(65 + row);
    for (let seat = 1; seat <= perRow; seat += 1) ids.push(`${letter}${String(seat)}`);
  }
  return ids;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export default function Home() {
  const router = useRouter();
  const [rows, setRows] = useState(5);
  const [perRow, setPerRow] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const result = await createShow(generateSeatIds(rows, perRow));
    if (result.ok) router.push(`/shows/${result.value.showId}`);
    else {
      setError("Couldn't create the show — is the API running on :5210?");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-5">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">open-ticket</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A live seat map over an event-sourced, eventually-consistent CQRS backend. Create a show,
          then open it in two tabs and race for the same seat — exactly one wins, live, no
          double-selling.
        </p>

        <form
          className="mt-8 rounded-xl border border-line bg-panel p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="flex flex-wrap gap-5">
            <Field
              label="Rows"
              value={rows}
              min={1}
              max={12}
              onChange={(value) => setRows(clamp(value, 1, 12))}
            />
            <Field
              label="Seats per row"
              value={perRow}
              min={1}
              max={16}
              onChange={(value) => setPerRow(clamp(value, 1, 16))}
            />
            <div className="flex items-end text-sm text-slate-500">
              = <span className="mx-1 font-semibold text-slate-300">{rows * perRow}</span> seats
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-mine px-4 py-2.5 text-sm font-semibold text-slate-900 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create show"}
          </button>
          {error !== "" && <p className="mt-3 text-sm text-sold">{error}</p>}
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm text-slate-400">
      <span className="mb-1.5 block">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          onChange(event.target.valueAsNumber);
        }}
        className="w-24 rounded-lg border border-line bg-canvas px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-mine"
      />
    </label>
  );
}
