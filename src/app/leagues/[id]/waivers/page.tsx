import { notFound } from "next/navigation";
import { processWaiversAction, waiverAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { availablePlayers } from "@/server/draft";
import { leagueContext } from "@/server/league";

export default async function WaiversPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const [players, roster, claims] = await Promise.all([
    availablePlayers(id), context.fantasyTeam ? getDatabase().rosterEntry.findMany({ where: { teamId: context.fantasyTeam.id }, include: { player: true } }) : [],
    getDatabase().waiverClaim.findMany({ where: { leagueId: id }, include: { addPlayer: true, dropPlayer: true, team: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">FAAB</p><h1 className="display">Waivers</h1><p className="muted">Claims process by bid, deterministic priority, then creation time. Ownership and budget updates are atomic.</p></div>
    <div className="league-details">{context.fantasyTeam && <form className="panel form-grid" action={waiverAction.bind(null, id)}><h2 className="display">Submit claim</h2><p>{context.fantasyTeam.faabRemaining} FAAB available</p><label>Add player<select name="addPlayerId" required>{players.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label><label>Drop player<select name="dropPlayerId"><option value="">No drop</option>{roster.map((entry) => <option key={entry.id} value={entry.playerId}>{entry.player.displayName}</option>)}</select></label><label>Bid<input name="bid" type="number" min="0" max={context.fantasyTeam.faabRemaining} defaultValue="0" required /></label><button className="button primary">Submit waiver</button></form>}
    <section className="panel"><h2 className="display">Claim history</h2>{context.role === "COMMISSIONER" && <form action={processWaiversAction.bind(null, id)}><button className="button secondary">Process due claims</button></form>}<ul className="transaction-list">{claims.map((claim) => <li key={claim.id}><strong>{claim.addPlayer.displayName}</strong><span>{claim.team.name} · {claim.bid} FAAB · {claim.status}</span>{claim.reason && <small>{claim.reason}</small>}</li>)}</ul></section></div>
  </LeagueShell>;
}
