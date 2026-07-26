import type { DevAppended } from "@open-ticket/contracts";

import { eventTypeColor } from "@/lib/dev-model";

/**
 * The live `$all` event feed (newest first, bounded). Rows are keyed by `position`, so only the
 * newly-prepended row mounts and plays the enter animation — existing rows don't re-animate.
 */
export function EventFeed({ events }: { events: readonly DevAppended[] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">event feed</h2>
        <span className="font-mono text-xs text-slate-500">{events.length} recent</span>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          no events yet — reserve a seat to watch the log fill.
        </p>
      ) : (
        <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto pr-1">
          {events.map((event) => (
            <li
              key={event.position}
              className="feed-enter flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
            >
              <span className="w-10 shrink-0 font-mono text-xs text-slate-600">
                #{event.position}
              </span>
              <span className={`font-medium ${eventTypeColor(event.type)}`}>{event.type}</span>
              <span className="ml-auto font-mono text-xs text-slate-600">
                {event.showId.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
