import Link from "next/link";
import { notFound } from "next/navigation";
import { autoPickAction, draftPauseAction, pickAction, queuePlayerAction, startDraftAction } from "@/app/actions/leagues";
import { DraftClock } from "@/components/draft-clock";
import { DraftQueue } from "@/components/draft-queue";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { availablePlayers } from "@/server/draft";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { displayTenths, playerStatistics } from "@/server/player-statistics";
import { fitsSlot } from "@/simulation/config";

type DraftView = "pool" | "board" | "results";

export default async function DraftPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sport?: string; draft?: string; q?: string; position?: string; view?: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const context = await leagueContext(user.id, id);
  if (!context) notFound();
  const selected = await resolveLeagueSport(id, query.sport);
  const database = getDatabase();
  const draft = await database.draft.findFirst({
    where: { leagueId: id, sport: selected.sport, ...(query.draft ? { id: query.draft } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      picks: { orderBy: { overall: "asc" }, include: { player: true, team: true } },
      queue: { where: context.fantasyTeam ? { teamId: context.fantasyTeam.id } : undefined, orderBy: { rank: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } } },
    },
  });
  const requestedView = ["pool", "board", "results"].includes(query.view ?? "") ? query.view as DraftView : "pool";
  const view = requestedView === "results" && draft?.status !== "COMPLETE" ? "pool" : requestedView;
  const visiblePool = Boolean(draft && ["ACTIVE", "PAUSED"].includes(draft.status));
  const players = visiblePool && view === "pool" ? await availablePlayers(id, query.q ?? "", query.position || undefined, 100, selected.sport) : [];
  const replayPeriod = context.league.isHistorical ? await database.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId: id, sport: selected.sport, number: Math.max(1, context.league.currentPeriod) } } }) : null;
  const statistics = await playerStatistics({ playerIds: [...players.map(({ id: playerId }) => playerId), ...(draft?.queue.map(({ playerId }) => playerId) ?? [])], presetId: context.league.presetId, seasonId: selected.seasonId, asOf: replayPeriod?.endsAt });
  const currentTeamId = draft && ["ACTIVE", "PAUSED"].includes(draft.status) ? draft.pickOrder[draft.currentPick - 1] : null;
  const currentTeam = context.league.teams.find(({ id: teamId }) => teamId === currentTeamId);
  const nextTeam = context.league.teams.find(({ id: teamId }) => teamId === draft?.pickOrder[draft.currentPick]);
  const myTeamId = context.fantasyTeam?.id;
  const myTurn = draft?.status === "ACTIVE" && currentTeamId === myTeamId;
  const nextMyOffset = draft && myTeamId ? draft.pickOrder.slice(Math.max(0, draft.currentPick - 1)).findIndex((teamId) => teamId === myTeamId) : -1;
  const myRoster = myTeamId ? await database.rosterEntry.findMany({
    where: { leagueId: id, teamId: myTeamId, sport: selected.sport, releasedAt: null },
    orderBy: [{ slot: "asc" }, { player: { displayName: "asc" } }],
    include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } },
  }) : [];
  const completedRosters = draft?.status === "COMPLETE" && view === "results" ? await database.fantasyTeam.findMany({
    where: { leagueId: id }, orderBy: { draftSlot: "asc" }, include: {
      sportRosters: { where: { sport: selected.sport }, include: { entries: { where: { releasedAt: null }, include: { player: true } } } },
      picks: { where: { draftId: draft.id }, orderBy: { overall: "asc" }, include: { player: true } },
    },
  }) : [];
  const slotRows = [...selected.rosterSlots.map((slot, index) => ({ key: `${slot}-${index}`, label: slot })), ...Array.from({ length: selected.benchSlots }, (_, index) => ({ key: `BENCH-${index}`, label: "BENCH" }))];
  const assigned = new Set<string>();
  const tabHref = (target: DraftView) => `/leagues/${id}/draft?sport=${selected.sport}${draft ? `&draft=${draft.id}` : ""}&view=${target}`;

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro draft-header"><p className="eyebrow">Live draft room</p><h1 className="display">{selected.sport} draft</h1>
      <LeagueSportTabs leagueId={id} path="/draft" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} />
      {draft && <div className="draft-status-grid"><div><span>Status</span><strong>{draft.status}</strong></div><div><span>Round</span><strong>{Math.floor((Math.max(1, draft.currentPick) - 1) / Math.max(1, draft.order.length)) + 1}</strong></div><div><span>Overall pick</span><strong>{Math.min(draft.currentPick, draft.pickOrder.length)} / {draft.pickOrder.length}</strong></div><div><span>On the clock</span><strong>{currentTeam?.name ?? "Complete"}{currentTeam?.isComputer ? " (Computer)" : ""}</strong></div><div><span>Next</span><strong>{nextTeam?.name ?? "—"}</strong></div><div><span>My next pick</span><strong>{nextMyOffset < 0 ? "No picks remaining" : nextMyOffset === 0 ? "Now" : `${nextMyOffset} pick${nextMyOffset === 1 ? "" : "s"}`}</strong></div></div>}
      {draft && <div className="draft-controls"><DraftClock status={draft.status} pickDeadlineAt={draft.pickDeadlineAt?.toISOString() ?? null} pausedRemainingMs={draft.pausedRemainingMs} secondsPerPick={draft.secondsPerPick} version={draft.version} />{context.role === "COMMISSIONER" && ["ACTIVE", "PAUSED"].includes(draft.status) && <form action={draftPauseAction.bind(null, id, draft.id, draft.status === "ACTIVE")}><button className="button secondary">{draft.status === "ACTIVE" ? "Pause draft" : "Resume draft"}</button></form>}</div>}
    </div>
    {!draft && context.role === "COMMISSIONER" && <section className="panel"><h2 className="display">Ready the {selected.sport} room</h2><p className="muted">This sport drafts independently. The development worker processes expired clocks even when no draft room is open.</p><form action={startDraftAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><button className="button primary">Start {selected.sport} snake draft</button></form></section>}
    {draft && <>
      <nav className="workspace-tabs" aria-label="Draft room views"><Link className={view === "pool" ? "active" : ""} href={tabHref("pool")}>Player Pool</Link><Link className={view === "board" ? "active" : ""} href={tabHref("board")}>Draft Board</Link><Link className={view === "results" ? "active" : ""} aria-disabled={draft.status !== "COMPLETE"} href={draft.status === "COMPLETE" ? tabHref("results") : tabHref("pool")}>Draft Results</Link></nav>
      {view === "pool" && <div className="draft-pool-layout">
        <aside className="draft-sidebar"><section className="panel"><h2 className="display">My Team</h2><p className="muted">{myRoster.length} / {slotRows.length} places filled</p><ol className="roster-slots">{slotRows.map(({ key, label }) => { const entry = myRoster.find((candidate) => !assigned.has(candidate.id) && candidate.slot === label); if (entry) assigned.add(entry.id); const stat = entry?.player.gameStats[0]; return <li key={key}><strong>{label}</strong>{entry ? <span>{entry.player.displayName}<small>{stat?.observedPositions.join(", ") || "POS N/A"}{stat?.team.code ? ` · ${stat.team.code}` : ""}</small></span> : <span className="muted">Empty</span>}</li>; })}</ol></section>
          <section className="panel"><h2 className="display">My Draft Queue</h2><p className="muted">Private · drag rows or use arrow controls</p><DraftQueue leagueId={id} draftId={draft.id} initialEntries={draft.queue.map((entry) => { const stats = statistics.get(entry.playerId); return { id: entry.id, rank: entry.rank, name: entry.player.displayName, positions: entry.player.gameStats[0]?.observedPositions ?? [], team: entry.player.gameStats[0]?.team.code ?? null, gamesPlayed: stats?.gamesPlayed ?? null, average: displayTenths(stats?.averageTenths), points: displayTenths(stats?.totalTenths) }; })} /></section></aside>
        <section className="panel draft-player-pool"><div className="section-heading"><div><h2 className="display">Available {selected.sport} players</h2><p className="muted">{draft.status === "PAUSED" ? "Queue changes remain available while selections are paused." : myTurn ? "Your franchise is on the clock." : "Drafting unlocks when your franchise is on the clock."}</p></div>{context.role === "COMMISSIONER" && draft.status === "ACTIVE" && <form action={autoPickAction.bind(null, id, draft.id)}><button className="button secondary">Auto-pick current team</button></form>}</div>
          {visiblePool ? <><form className="filter-bar" method="get"><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="draft" value={draft.id} /><input type="hidden" name="view" value="pool" /><label>Search <input name="q" defaultValue={query.q} /></label><label>POS <input name="position" defaultValue={query.position} /></label><button className="button secondary">Filter</button></form><div className="table-scroll"><table className="data-table player-pool-table"><thead><tr><th>Player</th><th>POS</th><th>TEAM</th><th>GP</th><th>AVG</th><th>PTS</th><th>PROJ</th><th>Actions</th></tr></thead><tbody>{players.map((player) => { const eligible = player.positions.length === 0 || selected.rosterSlots.some((slot) => fitsSlot(selected.sport, slot, new Set(player.positions))); const stat = player.gameStats[0]; const stats = statistics.get(player.id); return <tr key={player.id}><td><strong>{player.displayName}</strong></td><td>{player.positions.join(", ") || "N/A"}</td><td>{stat?.team?.code ?? "N/A"}</td><td>{stats?.gamesPlayed ?? "N/A"}</td><td>{displayTenths(stats?.averageTenths)}</td><td>{displayTenths(stats?.totalTenths)}</td><td>N/A</td><td><div className="button-row"><form action={queuePlayerAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button compact secondary">Queue</button></form><form action={pickAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button compact primary" disabled={!myTurn || !eligible}>Draft</button></form></div></td></tr>; })}</tbody></table></div>{!players.length && <p className="muted">No available players match these filters.</p>}</> : <p className="muted">The player pool is closed because this draft is complete.</p>}
        </section></div>}
      {view === "board" && <section className="panel"><div className="section-heading"><div><h2 className="display">Complete draft board</h2><p className="muted">Scroll horizontally for large leagues. The active selection and your franchise are highlighted.</p></div></div><div className="draft-board-scroll"><ol className="draft-order-list">{draft.pickOrder.map((teamId, index) => { const team = context.league.teams.find(({ id: value }) => value === teamId); const pick = draft.picks.find(({ overall }) => overall === index + 1); const complete = Boolean(pick); const active = index === draft.currentPick - 1 && ["ACTIVE", "PAUSED"].includes(draft.status); return <li key={`${teamId}-${index}`} className={`${complete ? "complete" : ""} ${active ? "active" : ""} ${teamId === myTeamId ? "mine" : ""}`}><span>{index + 1}</span><strong>{pick?.player.displayName ?? team?.name ?? "Unknown"}</strong><small>{pick ? `${team?.name}${pick.automatic ? " · Auto" : ""}` : team?.isComputer ? "Computer" : teamId === myTeamId ? "My franchise" : "Upcoming"}</small></li>; })}</ol></div></section>}
      {view === "results" && draft.status === "COMPLETE" && <section className="panel"><h2 className="display">Draft results</h2><div className="card-grid">{completedRosters.map((team) => { const roster = team.sportRosters[0]?.entries ?? []; const starters = roster.filter(({ slot }) => slot !== "BENCH"); return <article className="stat-card" key={team.id}><span>{team.isComputer ? "Computer-controlled" : team.managerId ? "Manager" : "Unmanaged"}</span><strong>{team.name}</strong><p>{roster.length} drafted · {starters.length} starters · {roster.filter(({ slot }) => slot === "BENCH").length} bench</p><ol className="pick-list">{team.picks.map((pick) => { const entry = roster.find(({ playerId }) => playerId === pick.playerId); return <li key={pick.id}><span>{pick.overall}</span><strong>{pick.player.displayName}</strong><small>{entry?.slot ?? "BENCH"} · scoring N/A</small></li>; })}</ol><p className="muted">{roster.length === selected.rosterSlots.length + selected.benchSlots ? "Roster complete" : `${selected.rosterSlots.length + selected.benchSlots - roster.length} places remain`}. No draft grades or projections are generated.</p></article>; })}</div><div className="button-row"><Link className="button primary" href={`/leagues/${id}/team?sport=${selected.sport}`}>My Team</Link><Link className="button secondary" href={`/leagues/${id}`}>League overview</Link></div></section>}
    </>}
  </LeagueShell>;
}
