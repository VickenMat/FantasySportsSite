import { notFound } from "next/navigation";
import { dropPlayerAction, renameTeamAction, selectKeeperAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { RosterPositionEditor, type PositionRow } from "@/components/roster-position-editor";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { fitsSlot } from "@/simulation/config";

export default async function TeamPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const context = await leagueContext(user.id, id);
  if (!context?.fantasyTeam) notFound();
  const selected = await resolveLeagueSport(id, query.sport);
  const roster = context.fantasyTeam.sportRosters.find(({ sport }) => sport === selected.sport);
  if (!roster) notFound();
  const database = getDatabase();
  const [entries, keepers] = await Promise.all([
    database.rosterEntry.findMany({
      where: { rosterId: roster.id, releasedAt: null },
      orderBy: { id: "asc" },
      include: { player: { include: { gameStats: { where: { game: { seasonId: selected.seasonId }, observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } },
    }),
    selected.seasonId ? database.keeperSelection.findMany({ where: { rosterId: roster.id, seasonId: selected.seasonId }, select: { playerId: true } }) : [],
  ]);
  const keeperIds = new Set(keepers.map(({ playerId }) => playerId));
  const assigned = new Set<string>();
  const starterRows: PositionRow[] = selected.rosterSlots.map((slot, index) => {
    const entry = entries.find((candidate) => !assigned.has(candidate.id) && candidate.slot === slot);
    if (entry) assigned.add(entry.id);
    const stat = entry?.player.gameStats[0];
    return { key: `${slot}-${index}`, label: slot, entry: entry ? { id: entry.id, name: entry.player.displayName, positions: stat?.observedPositions ?? [], team: stat?.team.code ?? null, locked: Boolean(entry.lockedAt) } : null };
  });
  const benchEntries = entries.filter(({ id: entryId }) => !assigned.has(entryId));
  const benchRows: PositionRow[] = Array.from({ length: Math.max(selected.benchSlots, benchEntries.length) }, (_, index) => {
    const entry = benchEntries[index]; const stat = entry?.player.gameStats[0];
    return { key: `BENCH-${index}`, label: "BENCH", entry: entry ? { id: entry.id, name: entry.player.displayName, positions: stat?.observedPositions ?? [], team: stat?.team.code ?? null, locked: Boolean(entry.lockedAt) } : null };
  });
  const rows = [...starterRows, ...benchRows];
  const legalDestinations = Object.fromEntries(rows.filter(({ entry }) => entry).map((source) => {
    const sourceEntry = source.entry!;
    const destinations = rows.filter((target) => {
      if (target.key === source.key || sourceEntry.locked || target.entry?.locked) return false;
      if (target.label !== "BENCH" && !fitsSlot(selected.sport, target.label, new Set(sourceEntry.positions))) return false;
      if (target.entry && source.label !== "BENCH" && !fitsSlot(selected.sport, source.label, new Set(target.entry.positions))) return false;
      return true;
    }).map(({ key }) => key);
    return [sourceEntry.id, destinations];
  }));

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><p className="eyebrow">My franchise</p><h1 className="display">{context.fantasyTeam.name}</h1><p className="muted">{selected.sport} · {selected.seasonLabel} · {roster.faabRemaining} FAAB remaining</p><LeagueSportTabs leagueId={id} path="/team" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    <section className="panel"><div className="section-heading"><div><h2 className="display">{selected.sport} roster</h2><p className="muted">Select a player&apos;s position button, then choose a highlighted legal destination. Occupied destinations swap atomically.</p></div></div>
      <RosterPositionEditor leagueId={id} sport={selected.sport} rows={rows} legalDestinations={legalDestinations} />
      {!entries.length && <p className="muted">This sport roster will populate through its draft and transactions.</p>}
    </section>
    <div className="league-details"><section className="panel"><h2 className="display">Roster actions</h2><ul className="transaction-list">{entries.map((entry) => <li key={entry.id}><strong>{entry.player.displayName}</strong><span>{entry.slot}{entry.lockedAt ? " · Lineup locked" : ""}</span><div className="button-row">{context.league.format === "REDRAFT" && selected.keeperLimit > 0 && (keeperIds.has(entry.playerId) ? <span className="tag">Keeper selected</span> : <form action={selectKeeperAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button compact secondary">Keep</button></form>)}<form action={dropPlayerAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button compact secondary" disabled={Boolean(entry.lockedAt)}>Drop</button></form></div></li>)}</ul></section>
      <form action={renameTeamAction.bind(null, id)} className="panel form-grid"><h2 className="display">Franchise identity</h2><p className="muted">One franchise name covers every sport.</p><label>Team name<input name="name" defaultValue={context.fantasyTeam.name} required /></label><button className="button secondary">Save team name</button></form></div>
  </LeagueShell>;
}
