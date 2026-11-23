import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { leagueContext } from "@/server/league";
import { standings } from "@/server/matchups";
import { formatScore } from "@/scoring/engine";

export default async function StandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; if (!await leagueContext(user.id, id)) notFound();
  const rows = await standings(id);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">League table</p><h1 className="display">Standings</h1></div><section className="panel"><table className="data-table"><thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr></thead><tbody>{rows.map((team) => <tr key={team.id}><td>{team.name}</td><td>{team.wins}</td><td>{team.losses}</td><td>{team.ties}</td><td>{formatScore(team.pointsFor)}</td><td>{formatScore(team.pointsAgainst)}</td></tr>)}</tbody></table></section></LeagueShell>;
}
