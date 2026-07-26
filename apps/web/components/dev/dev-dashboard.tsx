"use client";

import Link from "next/link";

import { EventFeed } from "@/components/dev/event-feed";
import { HealthBadge } from "@/components/dev/health-badge";
import { LagMeter } from "@/components/dev/lag-meter";
import { useDevStream } from "@/lib/use-dev-stream";
import { useHealth } from "@/lib/use-health";

/**
 * The dev dashboard (D3-07, observational in M3): subscribes to `/dev/stream` for the live event
 * feed + lag meter, and polls `/health` for the projection-health indicator. All live parts are
 * client-side; the page shell (app/dev/page.tsx) stays a Server Component.
 */
export function DevDashboard() {
  const { events, lag, connected } = useDevStream();
  const health = useHealth();

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">
            open-ticket <span className="font-normal text-slate-500">· dev dashboard</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            the{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono text-xs text-slate-300">
              $all
            </code>{" "}
            event log + projection lag, live
          </p>
        </div>
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2 text-sm text-slate-400">
            <span
              className={`live-dot inline-block h-2 w-2 rounded-full ${connected ? "bg-mine" : "bg-slate-600"}`}
              aria-hidden
            />
            {connected ? "streaming" : "connecting…"}
          </span>
          <HealthBadge health={health} />
        </div>
      </header>

      <div className="mt-8">
        <LagMeter lag={lag} />
      </div>

      <div className="mt-5">
        <EventFeed events={events} />
      </div>

      <div className="mt-8">
        <Link href="/" className="text-xs text-slate-500 transition-colors hover:text-slate-300">
          ← create a show
        </Link>
      </div>
    </main>
  );
}
