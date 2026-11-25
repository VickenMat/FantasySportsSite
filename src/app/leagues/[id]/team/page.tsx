import { notFound } from "next/navigation";
import { dropPlayerAction, renameTeamAction, selectKeeperAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { RosterPositionEditor, type PositionRow } from "@/components/roster-position-editor";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { getEligiblePositions } from "@/server/positions";
import { irEligiblePlayers } from "@/server/roster-availability";
import { slotRule } from "@/simulation/config";

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
  const leagueSports = context.league.sports;
  const [entries, keepers, replayPeriods] = await Promise.all([
    database.rosterEntry.findMany({
      where: { teamId: context.fantasyTeam.id, releasedAt: null, OR: [
        { rosterId: roster.id }, { slot: { in: ["UNIVERSAL_BENCH", "UNIVERSAL_IR", "IR"] } },
      ] },
      orderBy: { id: "asc" },
      include: { player: { include: { gameStats: { where: {
        game: { seasonId: { in: leagueSports.map(({ seasonId }) => seasonId) } }, observedPositions: { isEmpty: false },
      }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } },
    }),
    selected.seasonId ? database.keeperSelection.findMany({ where: { rosterId: roster.id, seasonId: selected.seasonId }, select: { playerId: true } }) : [],
    context.league.isHistorical ? database.scoringPeriod.findMany({
      where: { leagueId: id, number: Math.max(1, context.league.currentPeriod) },
      select: { sport: true, startsAt: true },
    }) : [],
  ]);
  const now = new Date();
  const decisionTimes = new Map(replayPeriods.map(({ sport, startsAt }) => [sport, startsAt]));
  const irEligible = new Set((await Promise.all(leagueSports.map(({ sport }) => irEligiblePlayers(
    database, entries.filter((entry) => entry.sport === sport).map(({ playerId }) => playerId), decisionTimes.get(sport) ?? now,
  )))).flatMap((players) => [...players]));
  const displayedEntries = await Promise.all(entries.map(async (entry) => {
    const leagueSport = leagueSports.find(({ sport }) => sport === entry.sport)!;
    const eligibility = await getEligiblePositions({
      playerId: entry.playerId, sport: entry.sport, seasonYear: leagueSport.season.startYear, asOf: decisionTimes.get(entry.sport) ?? now,
    });
    const stat = entry.player.gameStats[0];
    const positions = eligibility.positions.length ? eligibility.positions : context.league.isHistorical ? [] : stat?.observedPositions ?? [];
    return {
      id: entry.id, playerId: entry.playerId, name: entry.player.displayName, sport: entry.sport, positions,
      team: stat?.team.code ?? null, locked: Boolean(entry.lockedAt),
    };
  }));
  const byId = new Map(displayedEntries.map((entry) => [entry.id, entry]));
  const keeperIds = new Set(keepers.map(({ playerId }) => playerId));
  const starterIndexes = new Map<string, number>();
  function positionRow(slot: string, index: number, label = slot): PositionRow {
    const occupant = entries.find((entry) => entry.slotIndex === index &&
      (entry.slot === slot || (entry.slot === "IR" && slot === "UNIVERSAL_IR")));
    return { key: `${slot}-${index}`, label, slot, index, entry: occupant ? byId.get(occupant.id)! : null };
  }
  const starterRows = selected.rosterSlots.map((slot) => {
    const index = (starterIndexes.get(slot) ?? 0) + 1;
    starterIndexes.set(slot, index);
    return positionRow(slot, index);
  });
  const rows = [
    ...starterRows,
    ...Array.from({ length: selected.benchSlots }, (_, index) => positionRow("BENCH", index + 1)),
    ...Array.from({ length: context.league.universalBenchSlots }, (_, index) => positionRow("UNIVERSAL_BENCH", index + 1, "U-BENCH")),
    ...Array.from({ length: context.league.universalIrSlots }, (_, index) => positionRow("UNIVERSAL_IR", index + 1, "U-IR")),
  ];
  const canOccupy = (entry: NonNullable<PositionRow["entry"]>, target: PositionRow) => {
    if (target.slot === "UNIVERSAL_IR") return irEligible.has(entry.playerId);
    if (target.slot === "UNIVERSAL_BENCH") return true;
    return entry.sport === selected.sport && (target.slot === "BENCH" ||
      (slotRule(entry.sport, target.slot)?.positions.some((position) => entry.positions.includes(position)) ?? false));
  };
  const legalDestinations = Object.fromEntries(rows.filter(({ entry }) => entry).map((source) => {
    const sourceEntry = source.entry!;
    const destinations = rows.filter((target) => {
      if (target.key === source.key || sourceEntry.locked || target.entry?.locked) return false;
      return canOccupy(sourceEntry, target) && (!target.entry || canOccupy(target.entry, source));
    }).map(({ key }) => key);
    return [sourceEntry.id, destinations];
  }));

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><p className="eyebrow">My franchise</p><h1 className="display">{context.fantasyTeam.name}</h1><p className="muted">{selected.sport} · {selected.seasonLabel} · {roster.faabRemaining} FAAB remaining</p><LeagueSportTabs leagueId={id} path="/team" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    <section className="panel"><div className="section-heading"><div><h2 className="display">{selected.sport} roster</h2><p className="muted">Select a player&apos;s position button, then choose a highlighted legal destination. Occupied destinations swap atomically.</p></div></div>
      <RosterPositionEditor leagueId={id} rows={rows} legalDestinations={legalDestinations} />
      {!entries.length && <p className="muted">This sport roster will populate through its draft and transactions.</p>}
    </section>
    <div className="league-details"><section className="panel"><h2 className="display">Roster actions</h2><ul className="transaction-list">{entries.filter((entry) => entry.sport === selected.sport).map((entry) => <li key={entry.id}><strong>{entry.player.displayName}</strong><span>{entry.slot}{entry.lockedAt ? " · Lineup locked" : ""}</span><div className="button-row">{context.league.format === "REDRAFT" && selected.keeperLimit > 0 && (keeperIds.has(entry.playerId) ? <span className="tag">Keeper selected</span> : <form action={selectKeeperAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button compact secondary">Keep</button></form>)}<form action={dropPlayerAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button compact secondary" disabled={Boolean(entry.lockedAt)}>Drop</button></form></div></li>)}</ul></section>
      <form action={renameTeamAction.bind(null, id)} className="panel form-grid"><h2 className="display">Franchise identity</h2><p className="muted">One franchise name covers every sport.</p><label>Team name<input name="name" defaultValue={context.fantasyTeam.name} required /></label><button className="button secondary">Save team name</button></form></div>
  </LeagueShell>;
}
