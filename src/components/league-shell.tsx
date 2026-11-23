import type { ReactNode } from "react";
import { DashboardHeader } from "./dashboard-header";
import { LeagueNav } from "./league-nav";

export function LeagueShell({ leagueId, children }: { leagueId: string; children: ReactNode }) {
  return <><DashboardHeader /><LeagueNav leagueId={leagueId} /><main id="main" className="shell workspace">{children}</main></>;
}
