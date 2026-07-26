import { useEffect, useState } from "react";

import { checkHealth } from "./api.ts";
import type { ProjectionHealth } from "./api.ts";

const DEFAULT_INTERVAL_MS = 5_000;

/** Polls `/health` on an interval so a dead projection shows as degraded on the dashboard. */
export function useHealth(intervalMs: number = DEFAULT_INTERVAL_MS): ProjectionHealth {
  const [health, setHealth] = useState<ProjectionHealth>("unknown");

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const result = await checkHealth();
      if (active) setHealth(result);
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return health;
}
