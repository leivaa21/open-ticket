import type { Metadata } from "next";

import { DevDashboard } from "@/components/dev/dev-dashboard";

export const metadata: Metadata = {
  title: "open-ticket — dev dashboard",
};

/** Server Component shell; the live dashboard is a Client Component. */
export default function DevPage() {
  return <DevDashboard />;
}
