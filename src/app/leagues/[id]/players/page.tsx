import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { playerPage } from "@/server/draft";
import Link from "next/link";
import { leagueContext } from "@/server/league";
import { addPlayerAction } from "@/app/actions/leagues";

export default async function PlayersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; position?: string; page?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound();
  const result = await playerPage(id, { search: query.q, position: query.position, page: Number(query.page ?? 1), pageSize: 50 });
  const players = result.items;
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Player pool</p><h1 className="display">Available players</h1></div>
    <form className="filter-bar"><input name="q" placeholder="Search players" defaultValue={query.q} /><input name="position" placeholder="Position" defaultValue={query.position} /><button className="button secondary">Filter</button></form>
    <section className="panel"><div className="section-heading"><h2 className="display">Player pool</h2><p className="muted">{result.total.toLocaleString()} available</p></div><table className="data-table"><thead><tr><th>Player</th><th>Positions</th><th>Status</th><th>Action</th></tr></thead><tbody>{players.map((player) => <tr key={player.id}><td>{player.displayName}</td><td>{player.positions.join(", ") || "Unverified"}</td><td><span className="tag">Available</span></td><td><form action={addPlayerAction.bind(null, id)}><input type="hidden" name="playerId" value={player.id} /><button className="button secondary">Add</button></form></td></tr>)}</tbody></table>{!players.length && <p className="muted">No available players match this filter.</p>}<nav className="pagination" aria-label="Player pages">{result.page > 1 && <Link className="button secondary" href={{ query: { ...query, page: result.page - 1 } }}>Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page < result.pages && <Link className="button secondary" href={{ query: { ...query, page: result.page + 1 } }}>Next</Link>}</nav></section>
  </LeagueShell>;
}
