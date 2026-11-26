import { notFound } from "next/navigation";
import { dropPlayerAction, renameTeamAction, selectKeeperAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { RosterPositionEditor, type PositionRow } from "@/components/roster-position-editor";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { getEligiblePositions } from "@/server/positions";
import { sportIsOffseason } from "@/server/sport-offseason";
import { irEligiblePlayers } from "@/server/roster-availability";
import { slotRule } from "@/simulation/config";
import { displayTenths, playerStatistics } from "@/server/player-statistics";
import { financePolicy } from "@/server/finance";
import { waiverFunds } from "@/server/faab";
import { listFutureDraftPicks } from "@/server/dynasty-picks";

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
  const [entries, keepers, replayPeriods, futurePicks] = await Promise.all([
    database.rosterEntry.findMany({
      where: { teamId: context.fantasyTeam.id, releasedAt: null, OR: [
        { rosterId: roster.id }, { slot: { in: ["UNIVERSAL_BENCH", "UNIVERSAL_IR", "IR"] } },
      ] },
      orderBy: { id: "asc" },
      include: { player: { include: { gameStats: { where: {
        game: { seasonId: { in: leagueSports.map(({ seasonId }) => seasonId) } }, observedPositions: { isEmpty: false },
      }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } },
    }),
    selected.seasonId ? database.keeperSelection.findMany({ where: { rosterId: roster.id, seasonId: selected.seasonId }, select: { playerId: true, draftCost: true, player: { select: { displayName: true } } } }) : [],
    context.league.isHistorical ? database.scoringPeriod.findMany({
      where: { leagueId: id, number: Math.max(1, context.league.currentPeriod) },
      select: { sport: true, startsAt: true },
    }) : [],
    context.league.format === "DYNASTY" ? listFutureDraftPicks(user.id, id, selected.id, true)
      .then((picks) => picks.filter((pick) => pick.ownerTeamId === context.fantasyTeam!.id && pick.state === "AVAILABLE")) : [],
  ]);
  const financial = await financePolicy(database, id);
  const funds = await waiverFunds(database, id, selected.id, context.fantasyTeam.id);
  const now = new Date();
  const decisionTimes = new Map(replayPeriods.map(({ sport, startsAt }) => [sport, startsAt]));
  const statistics = new Map((await Promise.all(leagueSports.map(async (leagueSport) => [...await playerStatistics({
    playerIds: entries.filter((entry) => entry.sport === leagueSport.sport).map(({ playerId }) => playerId),
    presetId: context.league.presetId, seasonId: leagueSport.seasonId, asOf: decisionTimes.get(leagueSport.sport),
  })]))).flat());
  const irEligible = new Set((await Promise.all(leagueSports.map(async ({ id: sportId, sport }) => await sportIsOffseason(database, sportId, now) ? new Set<string>() : irEligiblePlayers(
    database, entries.filter((entry) => entry.sport === sport).map(({ playerId }) => playerId), decisionTimes.get(sport) ?? now,
  )))).flatMap((players) => [...players]));
  const movementPositions = new Map<string, string[]>();
  const displayedEntries = await Promise.all(entries.map(async (entry) => {
    const leagueSport = leagueSports.find(({ sport }) => sport === entry.sport)!;
    const eligibility = await getEligiblePositions({
      playerId: entry.playerId, sport: entry.sport, seasonYear: leagueSport.season.startYear, asOf: decisionTimes.get(entry.sport) ?? now,
    });
    const stat = entry.player.gameStats[0];
    movementPositions.set(entry.id, eligibility.positions.length ? eligibility.positions : context.league.isHistorical ? [] : stat?.observedPositions ?? []);
    const positions = eligibility.positions.length ? eligibility.positions : stat?.observedPositions ?? [];
    return {
      id: entry.id, playerId: entry.playerId, name: entry.player.displayName, sport: entry.sport, positions,
      team: stat?.team.code ?? null, locked: Boolean(entry.lockedAt),
      average: displayTenths(statistics.get(entry.playerId)?.averageTenths),
      points: displayTenths(statistics.get(entry.playerId)?.totalTenths),
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
    ...Array.from({ length: context.league.universalIrSlots }, (_, index) => positionRow("UNIVERSAL_IR", index + 1, "U-IR")),
    ...Array.from({ length: context.league.universalBenchSlots }, (_, index) => positionRow("UNIVERSAL_BENCH", index + 1, "U-BENCH")),
  ];
  const visibleIds = new Set(rows.flatMap(({ entry }) => entry ? [entry.id] : []));
  const overflow = entries.filter(({ id }) => !visibleIds.has(id));
  for (const entry of overflow) rows.push({ key: `overflow-${entry.id}`, label: `${entry.slot} ${entry.slotIndex} (overflow)`, slot: entry.slot, index: entry.slotIndex, entry: byId.get(entry.id)! });
  const canOccupy = (entry: NonNullable<PositionRow["entry"]>, target: PositionRow) => {
    if (target.slot === "UNIVERSAL_IR") return irEligible.has(entry.playerId);
    if (target.slot === "UNIVERSAL_BENCH") return true;
    return entry.sport === selected.sport && (target.slot === "BENCH" ||
      (slotRule(entry.sport, target.slot)?.positions.some((position) => movementPositions.get(entry.id)?.includes(position)) ?? false));
  };
  const legalDestinations = Object.fromEntries(rows.filter(({ entry }) => entry).map((source) => {
    const sourceEntry = source.entry!;
    const destinations = rows.filter((target) => {
      if (overflow.some(({ id }) => id === target.entry?.id)) return false;
      if (overflow.some(({ id }) => id === sourceEntry.id) && target.entry) return false;
      if (target.key === source.key || sourceEntry.locked || target.entry?.locked) return false;
      return canOccupy(sourceEntry, target) && (!target.entry || canOccupy(target.entry, source));
    }).map(({ key }) => key);
    return [sourceEntry.id, destinations];
  }));

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><p className="eyebrow">My franchise</p><form action={renameTeamAction.bind(null, id)} className="inline-form"><label className="sr-only" htmlFor="franchise-name">Franchise name</label><input id="franchise-name" className="display inline-title-input" name="name" defaultValue={context.fantasyTeam.name} required /><button className="button compact secondary" aria-label="Rename franchise">✎</button></form><p className="muted">{selected.sport} · {selected.seasonLabel} · {financial?.salaryMode ? "Salary dynasty · full salaries and obligations in Finances" : `${funds.balance} ${funds.scope === "UNIVERSAL" ? "universal cycle " : ""}FAAB remaining · ${funds.reserved} reserved`}</p><LeagueSportTabs leagueId={id} path="/team" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    <section className="panel"><div className="section-heading"><div><h2 className="display">{selected.sport} roster</h2><p className="muted">Select a player&apos;s position button, then choose a highlighted legal destination. Occupied destinations swap atomically.</p></div></div>
      {overflow.length > 0 && <p role="alert">{overflow.length} player{overflow.length === 1 ? " is" : "s are"} outside configured roster capacity. Every player is shown below. Move eligible players to empty legal slots or use the named Drop controls. Acquisitions remain blocked until compliance is restored.</p>}
      <p className="muted">Historical actuals for {selected.seasonLabel}; shared players use their own sport season. Unknown or incomplete scores are N/A. No projections.</p>
      {keepers.length > 0 && <p>Selected keepers for the next snake draft: {keepers.map((keeper) => `${keeper.player.displayName} (round ${keeper.draftCost ?? "pending review"})`).join(", ")}. A traded player must be selected by the current manager.</p>}
      <RosterPositionEditor leagueId={id} rows={rows} legalDestinations={legalDestinations} rookiePicks={futurePicks.length > 0 ? <section><h2 className="display">{selected.sport} rookie draft picks</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Season</th><th>Round</th><th>Original owner</th><th>Current owner</th></tr></thead><tbody>{futurePicks.map((pick) => <tr key={pick.id}><td>{pick.seasonStartYear}</td><td>{pick.round}</td><td>{pick.originalTeam.name}</td><td>{pick.ownerTeam.name}</td></tr>)}</tbody></table></div></section> : undefined} />
      {!entries.length && <p className="muted">This sport roster will populate through its draft and transactions.</p>}
      <div className="button-row">{entries.filter((entry) => entry.sport === selected.sport).map((entry) => <span key={entry.id}>{context.league.format === "REDRAFT" && selected.keeperLimit > 0 && !keeperIds.has(entry.playerId) && <form action={selectKeeperAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button compact secondary">Keep {entry.player.displayName}</button></form>}<form action={dropPlayerAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="playerId" value={entry.playerId} /><button className="button compact secondary" disabled={Boolean(entry.lockedAt)}>Drop {entry.player.displayName}</button></form></span>)}</div>
    </section>
  </LeagueShell>;
}
