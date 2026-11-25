import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { formatScore } from "@/scoring/engine";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { standings } from "@/server/matchups";
import { getDatabase } from "@/lib/db";

export default async function StandingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams; const context = await leagueContext(user.id, id); if (!context) notFound();
  const selected = await resolveLeagueSport(id, query.sport); const rows = await standings(id, selected.sport);
  const competition = await getDatabase().sportCompetition.findFirst({ where: { leagueId: id, sport: selected.sport } });
  const cumulative = context.league.competitionType === "CUMULATIVE"; const pending = competition?.status === "PENDING_DATA";
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">{cumulative ? "Cumulative UBP" : "Sport head-to-head"}</p><h1 className="display">{selected.sport} standings</h1><p className="muted">{competition?.status ?? "PENDING_DATA"}{competition?.statusReason ? ` · ${competition.statusReason}` : ""}</p><LeagueSportTabs leagueId={id} path="/standings" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div><section className="panel"><table className="data-table"><thead><tr><th>Rank</th><th>Team</th>{!cumulative && <><th>W</th><th>L</th><th>T</th></>}<th>PF</th>{!cumulative && <th>PA</th>}</tr></thead><tbody>{rows.map((team, index) => <tr key={team.id}><td>{pending ? "—" : index + 1}</td><td>{team.name}</td>{!cumulative && <><td>{team.wins}</td><td>{team.losses}</td><td>{team.ties}</td></>}<td>{pending ? "Pending" : formatScore(team.pointsFor)}</td>{!cumulative && <td>{pending ? "Pending" : formatScore(team.pointsAgainst)}</td>}</tr>)}</tbody></table></section></LeagueShell>;
}
