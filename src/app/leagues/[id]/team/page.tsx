import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { leagueContext } from "@/server/league";
import { dropPlayerAction, lineupAction, renameTeamAction } from "@/app/actions/leagues";
import { getDatabase } from "@/lib/db";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params;
  const context = await leagueContext(user.id, id); if (!context?.fantasyTeam) notFound();
  const roster = await getDatabase().rosterEntry.findMany({ where: { teamId: context.fantasyTeam.id }, include: { player: true }, orderBy: [{ slot: "asc" }, { player: { displayName: "asc" } }] });
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">My team</p><h1 className="display">{context.fantasyTeam.name}</h1><p className="muted">{context.fantasyTeam.faabRemaining} FAAB remaining</p></div>
    <div className="league-details"><section className="panel"><h2 className="display">Roster</h2>{roster.length ? <table className="data-table"><thead><tr><th>Slot</th><th>Player</th><th>Lineup</th><th>Action</th></tr></thead><tbody>{roster.map((entry) => <tr key={entry.id}><td>{entry.slot}</td><td>{entry.player.displayName}</td><td><form className="inline-form" action={lineupAction.bind(null, id)}><input type="hidden" name="entryId" value={entry.id} /><select name="slot" defaultValue={entry.slot}><option>BENCH</option>{context.league.rosterSlots.map((slot, index) => <option key={`${slot}-${index}`}>{slot}</option>)}</select><button className="button secondary">Set</button></form></td><td><form action={dropPlayerAction.bind(null, id)}><input type="hidden" name="playerId" value={entry.playerId} /><button className="button secondary">Drop</button></form></td></tr>)}</tbody></table> : <p className="muted">Your roster will populate through the draft and transactions.</p>}</section>
    <form action={renameTeamAction.bind(null, id)} className="panel form-grid"><h2 className="display">Team identity</h2><label>Team name<input name="name" defaultValue={context.fantasyTeam.name} required /></label><button className="button secondary">Save team name</button></form></div>
  </LeagueShell>;
}
