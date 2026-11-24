import Link from "next/link";
import type { Sport } from "@/generated/prisma/client";

export function LeagueSportTabs({ leagueId, path, sports, selected }: {
  leagueId: string; path: string; sports: readonly Sport[]; selected: Sport;
}) {
  return <nav className="sport-tabs" aria-label="League sport">
    {sports.map((sport) => <Link key={sport} className={sport === selected ? "active" : ""}
      aria-current={sport === selected ? "page" : undefined}
      href={`/leagues/${leagueId}${path}?sport=${sport}`}>{sport}</Link>)}
  </nav>;
}
