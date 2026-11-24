import { notFound } from "next/navigation";
import { dropPlayerAction, lineupAction, renameTeamAction, selectKeeperAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function TeamPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }>;
}) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context?.fantasyTeam) notFound();
  const selected = await resolveLeagueSport(id, query.sport); const roster = context.fantasyTeam.sportRosters.find(({ sport }) => sport === selected.sport);
  if (!roster) notFound();
  const keepers = selected.seasonId ? await getDatabase().keeperSelection.findMany({ where: { rosterId: roster.id, seasonId: selected.seasonId }, select: { playerId: true } }) : [];
  const keeperIds = new Set(keepers.map(({ playerId }) => playerId));
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><p className="eyebrow">My franchise</p><h1 className="display">{context.fantasyTeam.name}</h1>
      <p className="muted">{selected.sport} · {selected.seasonLabel} · {roster.faabRemaining} FAAB remaining</p>
      <LeagueSportTabs leagueId={id} path="/team" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} />
    </div>
    <div className="league-details"><section className="panel"><h2 className="display">{selected.sport} roster</h2>
      {roster.entries.length ? <table className="data-table"><thead><tr><th>Slot</th><th>Player</th><th>Lineup</th><th>Keeper</th><th>Action</th></tr></thead><tbody>
        {roster.entries.sort((a, b) => a.slot.localeCompare(b.slot) || a.player.displayName.localeCompare(b.player.displayName)).map((entry) => <tr key={entry.id}><td>{entry.slot}</td><td>{entry.player.displayName}</td><td>
          <form className="inline-form" action={lineupAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="entryId" value={entry.id} />
            <select name="slot" defaultValue={entry.slot}><option>BENCH</option>{selected.rosterSlots.map((slot, index) => <option key={`${slot}-${index}`}>{slot}</option>)}</select><button className="button secondary">Set</button></form>
        </td><td>{context.league.format === "REDRAFT" && selected.keeperLimit > 0 ? keeperIds.has(entry.playerId) ? <span className="tag">Selected</span> :
          <form action={selectKeeperAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button secondary">Keep</button></form> : "—"}</td><td>
          <form action={dropPlayerAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button secondary">Drop</button></form>
        </td></tr>)}</tbody></table> : <p className="muted">This sport roster will populate through its draft and transactions.</p>}
    </section>
    <form action={renameTeamAction.bind(null, id)} className="panel form-grid"><h2 className="display">Franchise identity</h2><p className="muted">One franchise name covers every sport.</p><label>Team name<input name="name" defaultValue={context.fantasyTeam.name} required /></label><button className="button secondary">Save team name</button></form></div>
  </LeagueShell>;
}
