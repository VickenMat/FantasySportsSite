import Link from "next/link";
import { notFound } from "next/navigation";
import { addPlayerAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { playerPage } from "@/server/draft";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function PlayersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string; q?: string; position?: string; page?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound(); const selected = await resolveLeagueSport(id, query.sport);
  const result = await playerPage(id, { sport: selected.sport, search: query.q, position: query.position, page: Number(query.page ?? 1), pageSize: 50 });
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Player pool</p><h1 className="display">Available {selected.sport} players</h1>
    <LeagueSportTabs leagueId={id} path="/players" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    <form className="filter-bar"><input type="hidden" name="sport" value={selected.sport} /><input name="q" placeholder="Search players" defaultValue={query.q} /><input name="position" placeholder="Position" defaultValue={query.position} /><button className="button secondary">Filter</button></form>
    <section className="panel"><div className="section-heading"><h2 className="display">{selected.sport} pool</h2><p className="muted">{result.total.toLocaleString()} available</p></div><table className="data-table"><thead><tr><th>Player</th><th>Positions</th><th>Status</th><th>Action</th></tr></thead><tbody>{result.items.map((player) => <tr key={player.id}><td>{player.displayName}</td><td>{player.positions.join(", ") || "Unverified"}</td><td><span className="tag">Available</span></td><td><form action={addPlayerAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={player.id} /><button className="button secondary">Add</button></form></td></tr>)}</tbody></table>{!result.items.length && <p className="muted">No available players match this filter.</p>}
      <nav className="pagination" aria-label="Player pages">{result.page > 1 && <Link className="button secondary" href={{ query: { ...query, sport: selected.sport, page: result.page - 1 } }}>Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page < result.pages && <Link className="button secondary" href={{ query: { ...query, sport: selected.sport, page: result.page + 1 } }}>Next</Link>}</nav>
    </section></LeagueShell>;
}
