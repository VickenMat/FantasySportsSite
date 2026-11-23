import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { availablePlayers } from "@/server/draft";
import { leagueContext } from "@/server/league";
import { addPlayerAction } from "@/app/actions/leagues";

export default async function PlayersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; position?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound();
  const players = await availablePlayers(id, query.q, query.position);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Player pool</p><h1 className="display">Available players</h1></div>
    <form className="filter-bar"><input name="q" placeholder="Search players" defaultValue={query.q} /><input name="position" placeholder="Position" defaultValue={query.position} /><button className="button secondary">Filter</button></form>
    <section className="panel"><table className="data-table"><thead><tr><th>Player</th><th>Positions</th><th>Status</th><th>Action</th></tr></thead><tbody>{players.map((player) => <tr key={player.id}><td>{player.displayName}</td><td>{player.positions.join(", ") || "Unverified"}</td><td><span className="tag">Available</span></td><td><form action={addPlayerAction.bind(null, id)}><input type="hidden" name="playerId" value={player.id} /><button className="button secondary">Add</button></form></td></tr>)}</tbody></table>{!players.length && <p className="muted">No available players match this filter.</p>}</section>
  </LeagueShell>;
}
