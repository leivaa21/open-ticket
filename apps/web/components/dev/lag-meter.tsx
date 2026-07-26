import type { DevLag } from "@open-ticket/contracts";

import { lagFraction, lagState } from "@/lib/dev-model";

/**
 * The projection-lag meter (D3-02 centerpiece): head vs asOf and how many events the projection
 * still trails by. The bar fills as the projection catches up — full + teal when caught up, partial
 * + amber while behind. In-memory lag is ~0 almost always (calm); M4's throttle makes it recede.
 */
export function LagMeter({ lag }: { lag: DevLag | null }) {
  if (lag === null) {
    return (
      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-sm font-semibold text-slate-300">projection lag</h2>
        <p className="mt-3 text-sm text-slate-500">waiting for the stream…</p>
      </section>
    );
  }

  const caught = lagState(lag) === "caught-up";
  const percent = Math.round(lagFraction(lag) * 100);

  return (
    <section aria-label="projection lag" className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">projection lag</h2>
        <span
          className={`flex items-center gap-1.5 text-sm font-medium ${caught ? "text-mine" : "text-held"}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${caught ? "bg-mine" : "live-dot bg-held"}`}
            aria-hidden
          />
          {caught ? "caught up" : `${String(lag.behind)} behind`}
        </span>
      </div>

      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-canvas"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={caught ? "caught up" : `${String(lag.behind)} events behind`}
        aria-label="projection caught up"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${caught ? "bg-mine" : "bg-held"}`}
          style={{ width: `${String(percent)}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="head" value={lag.head} />
        <Stat label="asOf" value={lag.asOf} />
        <Stat label="behind" value={lag.behind} highlight={!caught} />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-0.5 font-mono text-lg ${highlight ? "text-held" : "text-slate-100"}`}>
        {value}
      </dd>
    </div>
  );
}
