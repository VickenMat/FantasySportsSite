import { notFound } from "next/navigation";
import { processWaiversAction, waiverAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { availablePlayers } from "@/server/draft";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function WaiversPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound(); const selected = await resolveLeagueSport(id, query.sport);
  const managedRoster = context.fantasyTeam?.sportRosters.find(({ sport }) => sport === selected.sport);
  const [players, claims] = await Promise.all([availablePlayers(id, "", undefined, 100, selected.sport), getDatabase().waiverClaim.findMany({ where: { leagueId: id, sport: selected.sport }, include: { addPlayer: true, dropPlayer: true, team: true }, orderBy: { createdAt: "desc" }, take: 100 })]);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">FAAB</p><h1 className="display">{selected.sport} waivers</h1><p className="muted">Claims process by bid, deterministic priority, then creation time. Ownership and budget changes are atomic.</p><LeagueSportTabs leagueId={id} path="/waivers" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    <div className="league-details">{managedRoster && <form className="panel form-grid" action={waiverAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><h2 className="display">Submit claim</h2><p>{managedRoster.faabRemaining} FAAB available</p><label>Add player<select name="addPlayerId" required>{players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label><label>Drop player<select name="dropPlayerId"><option value="">No drop</option>{managedRoster.entries.map((entry) => <option key={entry.id} value={entry.playerId}>{entry.player.displayName}</option>)}</select></label><label>Bid<input name="bid" type="number" min="0" max={managedRoster.faabRemaining} defaultValue="0" required /></label><button className="button primary">Submit waiver</button></form>}
    <section className="panel"><h2 className="display">Claim history</h2>{context.role === "COMMISSIONER" && <form action={processWaiversAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><button className="button secondary">Process due claims</button></form>}<ul className="transaction-list">{claims.map((claim) => <li key={claim.id}><strong>{claim.addPlayer.displayName}</strong><span>{claim.team.name} · {claim.bid} FAAB · {claim.status}</span>{claim.reason && <small>{claim.reason}</small>}</li>)}</ul>{!claims.length && <p className="muted">No {selected.sport} claims yet.</p>}</section></div>
  </LeagueShell>;
}
