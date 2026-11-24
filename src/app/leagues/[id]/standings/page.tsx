import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { formatScore } from "@/scoring/engine";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { standings } from "@/server/matchups";

export default async function StandingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams; const context = await leagueContext(user.id, id); if (!context) notFound();
  const selected = await resolveLeagueSport(id, query.sport); const rows = await standings(id, selected.sport);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">League table</p><h1 className="display">{selected.sport} standings</h1><LeagueSportTabs leagueId={id} path="/standings" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div><section className="panel"><table className="data-table"><thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr></thead><tbody>{rows.map((team) => <tr key={team.id}><td>{team.name}</td><td>{team.wins}</td><td>{team.losses}</td><td>{team.ties}</td><td>{formatScore(team.pointsFor)}</td><td>{formatScore(team.pointsAgainst)}</td></tr>)}</tbody></table></section></LeagueShell>;
}
