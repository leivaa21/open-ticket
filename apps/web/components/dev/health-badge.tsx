import type { ProjectionHealth } from "@/lib/api";

const CONFIG: Record<ProjectionHealth, { label: string; dot: string; text: string }> = {
  healthy: { label: "healthy", dot: "bg-mine", text: "text-mine" },
  degraded: { label: "projection degraded", dot: "bg-sold", text: "text-sold" },
  unknown: { label: "checking…", dot: "bg-slate-600", text: "text-slate-500" },
};

/** Projection-health indicator. The text label is the non-colour cue (accessibility). */
export function HealthBadge({ health }: { health: ProjectionHealth }) {
  const config = CONFIG[health];
  return (
    <span className={`flex items-center gap-2 text-sm ${config.text}`} role="status">
      <span className={`inline-block h-2 w-2 rounded-full ${config.dot}`} aria-hidden />
      {config.label}
    </span>
  );
}
