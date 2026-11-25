import Link from "next/link";
import type { Sport } from "@/generated/prisma/client";

export function LeagueSportTabs({ leagueId, path, sports, selected, combined = false }: {
  leagueId: string; path: string; sports: readonly Sport[]; selected: Sport | "combined"; combined?: boolean;
}) {
  return <nav className="sport-tabs" aria-label="League sport">
    {combined && <Link className={selected === "combined" ? "active" : ""}
      aria-current={selected === "combined" ? "page" : undefined}
      href={`/leagues/${leagueId}${path}?sport=combined`}>Combined</Link>}
    {sports.map((sport) => <Link key={sport} className={sport === selected ? "active" : ""}
      aria-current={sport === selected ? "page" : undefined}
      href={`/leagues/${leagueId}${path}?sport=${sport}`}>{sport}</Link>)}
  </nav>;
}
