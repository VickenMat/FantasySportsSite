import { AdministrationForm } from "@/components/administration-form";
import { draftCorrectionState, draftJobKey } from "@/server/draft-corrections";
import Link from "next/link";
import { RookieDraftForm } from "@/components/rookie-draft-form";
import { notFound } from "next/navigation";
import { autoPickAction, draftPauseAction, pickAction, queuePlayerAction, startDraftAction } from "@/app/actions/leagues";
import { DraftClock } from "@/components/draft-clock";
import { DraftQueue } from "@/components/draft-queue";
import { LeagueShell } from "@/components/league-shell";
import { DraftSportSelect } from "@/components/draft-sport-select";
import { PositionBadges } from "@/components/position-badge";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { availablePlayers } from "@/server/draft";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { displayTenths, playerStatistics } from "@/server/player-statistics";
import { fitsSlot } from "@/simulation/config";
import { DraftConfiguration } from "@/components/draft-configuration";
import { DraftScheduleStatus } from "@/components/draft-schedule-status";
import { draftRoomState, listDraftPlans, testingDraftShortcutAllowed } from "@/server/draft-plans";
import { hasGameplayTable } from "@/server/gameplay-storage";
import { financePolicy } from "@/server/finance";
import { AuctionPanel } from "@/components/auction-panel";
import { NominateAuctionForm } from "@/components/auction-actions";

type DraftView = "pool" | "board" | "results";

export default async function DraftPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sport?: string; scope?: string; draft?: string; q?: string; position?: string; view?: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const context = await leagueContext(user.id, id);
  if (!context) notFound();
  const selected = await resolveLeagueSport(id, query.sport);
  const database = getDatabase();
  const plans = await listDraftPlans(id);
  const financial = await financePolicy(database, id);
  const seasonEvidence = context.league.isHistorical ? null : await database.professionalSeasonScheduleRevision.findFirst({where:{seasonId:selected.seasonId,retrievedAt:{lte:new Date()}},orderBy:{retrievedAt:"desc"}});
  const rookieRule = await hasGameplayTable("RookieDraftRule") ? await database.rookieDraftRule.findUnique({ where: { leagueSportId: selected.id } }) : null;
  const plan = plans.find((plan) => plan.draftId === query.draft) ?? plans.find((plan) => plan.leagueSportId === selected.id && plan.seasonId === selected.seasonId && !["CANCELLED", "COMPLETED"].includes(plan.status)) ?? plans.find((plan) => plan.leagueSportId === selected.id && plan.seasonId === selected.seasonId) ?? plans.find((plan) => plan.scope === "UNIVERSAL" && !["CANCELLED", "COMPLETED"].includes(plan.status));
  const primary = context.league.sports.find(s=>s.sport===context.league.primarySport) ?? context.league.sports[0];
  const universalSupported = plan?.scope === "UNIVERSAL" || (context.league.sports.length>1 && !context.league.sports.some(s=>s.keeperLimit>0) && !plans.some(p=>p.scope==="SPORT"&&p.leagueSportId!==primary.id&&p.status!=="CANCELLED"));
  const roomState = plan ? draftRoomState(plan, new Date()) : null;
  const draft = await database.draft.findFirst({
    where: { leagueId: id, ...(query.draft ? { id: query.draft } : plan?.draftId ? { id: plan.draftId } : { sport: selected.sport, seasonId: selected.seasonId }) },
    orderBy: { createdAt: "desc" },
    include: {
      picks: { orderBy: { overall: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } }, team: true } },
      queue: { where: { teamId: context.fantasyTeam?.id ?? "00000000-0000-0000-0000-000000000000" }, orderBy: { rank: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } } },
    },
  });
  const recaps = new Map(await hasGameplayTable("DraftSelectionSnapshot") && draft ? (await database.draftSelectionSnapshot.findMany({ where: { pick: { draftId: draft.id } } })).map((row) => [row.pickId, row] as const) : []);
  const corrections = await draftCorrectionState(database, draft?.picks.map(({ id }) => id) ?? []);
  for (const [pickId, event] of corrections) {
    if (event.action === "RESELECT_DRAFT_PICK" && recaps.has(pickId)) recaps.set(pickId, { ...recaps.get(pickId)!, ...(event.after as object) });
  }
  if (draft) draft.picks = draft.picks.filter((pick) => corrections.get(pick.id)?.action !== "UNDO_DRAFT_PICK");
  const history = await database.draft.findMany({ where: { leagueId: id }, orderBy: { createdAt: "desc" }, include: { season: true }, take: 100 });
  const requestedView = ["pool", "board", "results"].includes(query.view ?? "") ? query.view as DraftView : "pool";
  const view = requestedView === "results" && draft?.status !== "COMPLETE" ? "pool" : requestedView;
  const visiblePool = Boolean(draft && (["ACTIVE", "PAUSED"].includes(draft.status) || (draft.status === "SCHEDULED" && ["ROOM_OPEN", "AWAITING_START", "BLOCKED"].includes(roomState ?? ""))));
  const players = visiblePool && view === "pool" ? await availablePlayers(id, query.q ?? "", query.position || undefined, 100, selected.sport, draft?.kind === "ROOKIE") : [];
  const replayPeriod = context.league.isHistorical ? await database.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId: id, sport: selected.sport, number: Math.max(1, context.league.currentPeriod) } } }) : null;
  const statistics = await playerStatistics({ playerIds: [...players.map(({ id: playerId }) => playerId), ...(draft?.queue.map(({ playerId }) => playerId) ?? [])], presetId: context.league.presetId, seasonId: selected.seasonId, asOf: replayPeriod?.endsAt });
  const currentTeamId = draft && ["ACTIVE", "PAUSED"].includes(draft.status) ? draft.pickOrder[draft.currentPick - 1] : null;
  const processing = draft ? await database.backgroundJobRun.findUnique({ where: { key: draftJobKey(draft) } }) : null;
  const processingReason = processing?.result as { error?: string } | null;
  const currentTeam = context.league.teams.find(({ id: teamId }) => teamId === currentTeamId);
  const nextTeam = context.league.teams.find(({ id: teamId }) => teamId === draft?.pickOrder[draft.currentPick]);
  const myTeamId = context.fantasyTeam?.id;
  const myTurn = draft?.status === "ACTIVE" && currentTeamId === myTeamId;
  const nextMyOffset = draft && draft.status !== "COMPLETE" && myTeamId ? draft.pickOrder.slice(Math.max(0, draft.currentPick - 1)).findIndex((teamId) => teamId === myTeamId) : -1;
  const myRoster = myTeamId ? await database.rosterEntry.findMany({
    where: { leagueId: id, teamId: myTeamId, sport: selected.sport, releasedAt: null },
    orderBy: [{ slot: "asc" }, { player: { displayName: "asc" } }],
    include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } },
  }) : [];
  const slotRows = [...selected.rosterSlots.map((slot, index) => ({ key: `${slot}-${index}`, label: slot })), ...Array.from({ length: selected.benchSlots }, (_, index) => ({ key: `BENCH-${index}`, label: "BENCH" }))];
  const assigned = new Set<string>();
  const orderDetails = draft?.orderProvenance?.startsWith("{") ? JSON.parse(draft.orderProvenance) : null;
  const currentRound = draft ? orderDetails?.slots?.[Math.min(draft.currentPick - 1, draft.pickOrder.length - 1)]?.round ?? Math.floor((Math.max(1, draft.currentPick) - 1) / Math.max(1, draft.order.length)) + 1 : null;
  const tabHref = (target: DraftView) => `/leagues/${id}/draft?sport=${selected.sport}${draft ? `&draft=${draft.id}` : ""}&view=${target}`;

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro draft-header"><p className="eyebrow">{draft?.status === "COMPLETE" ? "Draft recap" : "Live draft room"}</p><h1 className="display">{plan?.scope === "UNIVERSAL" ? "Universal" : selected.sport} {draft?.kind === "ROOKIE" ? "rookie " : ""}draft</h1>
      <DraftSportSelect leagueId={id} sports={context.league.sports.map(s=>s.sport)} selected={plan?.scope==="UNIVERSAL"||query.scope==="UNIVERSAL"?"UNIVERSAL":selected.sport} primarySport={context.league.primarySport ?? context.league.sports[0].sport} universal={universalSupported} />
      {draft && <div className="draft-status-grid"><div><span>Status</span><strong>{draft.status}</strong></div><div><span>Round</span><strong>{currentRound}</strong></div><div><span>Overall pick</span><strong>{Math.min(draft.currentPick, draft.pickOrder.length)} / {draft.pickOrder.length}</strong></div><div><span>On the clock</span><strong>{currentTeam?.name ?? "Complete"}{currentTeam?.isComputer ? " (Computer)" : ""}</strong></div><div><span>Next</span><strong>{nextTeam?.name ?? "—"}</strong></div><div><span>My next pick</span><strong>{nextMyOffset < 0 ? "No picks remaining" : nextMyOffset === 0 ? "Now" : `${nextMyOffset} pick${nextMyOffset === 1 ? "" : "s"}`}</strong></div></div>}
      {draft && <div className="draft-controls"><DraftClock status={draft.status} pickDeadlineAt={draft.pickDeadlineAt?.toISOString() ?? null} pausedRemainingMs={draft.pausedRemainingMs} secondsPerPick={draft.secondsPerPick} version={draft.version} />{context.role === "COMMISSIONER" && ["ACTIVE", "PAUSED"].includes(draft.status) && <form action={draftPauseAction.bind(null, id, draft.id, draft.status === "ACTIVE")}><button className="button secondary">{draft.status === "ACTIVE" ? "Pause draft" : "Resume draft"}</button></form>}</div>}
    </div>
    {context.role === "COMMISSIONER" && draft?.status === "PAUSED" && <details className="panel"><summary>Correct the last selection</summary><p>Only the most recent unfinished traditional initial snake selection can be reversed. Locked lineups, downstream roster movement, consumed rookie entitlements and settled auction accounting are protected.</p><AdministrationForm leagueId={id} operation="DRAFT_UNDO" label="Undo last selection"><input name="draftId" type="hidden" value={draft.id} /><label>Reason<input name="reason" required minLength={10} /></label></AdministrationForm><AdministrationForm leagueId={id} operation="DRAFT_CORRECT" label="Replace last selection atomically"><input name="draftId" type="hidden" value={draft.id} /><label>Replacement player<select name="playerId" required>{players.map((player) => <option key={player.id} value={player.id}>{player.displayName} · {player.sport}</option>)}</select></label><label>Reason<input name="reason" required minLength={10} /></label></AdministrationForm></details>}
    <details className="panel"><summary>Draft history and recaps</summary><ul>{history.map((row) => <li key={row.id}><Link href={`/leagues/${id}/draft?sport=${row.sport}&draft=${row.id}&view=${row.status === "COMPLETE" ? "results" : "pool"}`}>{row.sport} {row.season.label} · {row.kind} · {row.status}</Link></li>)}</ul></details>
    {context.league.format === "DYNASTY" && !financial?.salaryMode && <section className="panel"><h2 className="display">Traditional dynasty rookie drafts</h2><p>Linear reverse finalized sport placement. Original slots and current entitlement owners stay distinct.</p><Link href={`/leagues/${id}/picks?sport=${selected.sport}`}>Future pick inventory and ownership history</Link>{context.role === "COMMISSIONER" && (!draft || draft.kind !== "ROOKIE" || draft.status === "SCHEDULED") && <RookieDraftForm leagueId={id} leagueSportId={selected.id} rounds={rookieRule?.rounds ?? 4} current={plan?.kind === "ROOKIE" ? { version: plan.version, scheduledAt: plan.scheduledAt?.toISOString() ?? null, secondsPerPick: plan.secondsPerPick } : undefined} />}</section>}
    <p><Link href={"/leagues/" + id + "/finances"}>Auction budgets and salary configuration</Link></p>
    {draft && plan?.method === "AUCTION" && visiblePool && <AuctionPanel userId={user.id} leagueId={id} draftId={draft.id} />}
    {plan && <section className="panel"><DraftScheduleStatus scheduledAt={plan.scheduledAt?.toISOString() ?? null} timezone={plan.timezone} status={roomState!} refresh />{plan.blockedReason && <p role="alert">{plan.blockedReason}</p>}<ol aria-label="Saved initial draft order">{plan.order.map((teamId) => <li key={teamId}>{context.league.teams.find(({ id }) => id === teamId)?.name ?? teamId}</li>)}</ol></section>}
    {!context.league.isHistorical && seasonEvidence?.status!=="AVAILABLE" && <p className="muted">A valid plan can be saved while season evidence is pending. Activation requires verified boundaries for every covered sport.</p>}
    {context.role === "COMMISSIONER" && plan?.kind !== "ROOKIE" && (!plan || plan.leagueSportId === selected.id) && (!draft || draft.status === "SCHEDULED") && <DraftConfiguration key={`${selected.id}:${query.scope??plan?.scope??"SPORT"}`} leagueId={id} leagueSportId={selected.id} seasonId={selected.seasonId} sport={selected.sport} sports={context.league.sports.map(s=>s.sport)} seasonLabel={`${selected.sport} ${selected.seasonLabel}`} teams={context.league.teams} enabled={await hasGameplayTable("DraftPlan")} auctionEnabled={Boolean(financial)} salaryMode={Boolean(financial?.salaryMode)} universalAvailable={selected.id===primary.id && universalSupported} current={{ scope: plan?.scope ?? (query.scope === "UNIVERSAL" && selected.id===primary.id && universalSupported ? "UNIVERSAL" : "SPORT"), method: plan?.method ?? "SNAKE", version: plan?.version ?? 0, order: plan?.order ?? selected.draftOrder, orderMethod: plan?.orderMethod ?? "CUSTOM", rounds: plan?.rounds ?? selected.draftRounds, secondsPerPick: plan?.secondsPerPick ?? draft?.secondsPerPick ?? 60, scheduledAt: plan?.scheduledAt?.toISOString() ?? null, timezone: plan?.timezone ?? "America/New_York" }} />}
    {(!draft || draft.status === "SCHEDULED") && plan?.kind !== "ROOKIE" && context.role === "COMMISSIONER" && testingDraftShortcutAllowed() && <section className="panel"><h2 className="display">Development testing</h2><p>Bypasses the waiting period only. Configuration, participation, season evidence and compliance gates still apply.</p><form action={startDraftAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><button className="button secondary">Start Draft Now (testing)</button></form></section>}
    {draft && <>
      {processing && ["BLOCKED", "FAILED"].includes(processing.status) && <section className="panel" role="alert"><h2 className="display">Automatic selection needs attention</h2><p>{processingReason?.error}</p><Link href={`/leagues/${id}/team?sport=${selected.sport}`}>Review My Team</Link>{context.role === "COMMISSIONER" && <p><Link href={`/leagues/${id}/rosters`}>Inspect every franchise and make an audited roster correction</Link></p>}</section>}
      <nav className="workspace-tabs" aria-label="Draft room views"><Link className={view === "pool" ? "active" : ""} href={tabHref("pool")}>Player Pool</Link><Link className={view === "board" ? "active" : ""} href={tabHref("board")}>Draft Board</Link><Link className={view === "results" ? "active" : ""} aria-disabled={draft.status !== "COMPLETE"} href={draft.status === "COMPLETE" ? tabHref("results") : tabHref("pool")}>Draft Results</Link></nav>
      {view === "pool" && <div className="draft-pool-layout">
        <aside className="draft-sidebar"><section className="panel"><h2 className="display">My Team</h2><p className="muted">{myRoster.length} / {slotRows.length} places filled</p><ol className="roster-slots">{slotRows.map(({ key, label }) => { const entry = myRoster.find((candidate) => !assigned.has(candidate.id) && candidate.slot === label); if (entry) assigned.add(entry.id); const stat = entry?.player.gameStats[0]; return <li key={key}><strong>{label}</strong>{entry ? <span>{entry.player.displayName}<small><PositionBadges sport={selected.sport} positions={stat?.observedPositions ?? []} />{stat?.team.code ? ` · ${stat.team.code}` : ""}</small></span> : <span className="muted">Empty</span>}</li>; })}</ol></section>
          <section className="panel"><h2 className="display">My Draft Queue</h2><p className="muted">Private · drag rows or use arrow controls</p><DraftQueue leagueId={id} draftId={draft.id} initialEntries={draft.queue.map((entry) => { const stats = statistics.get(entry.playerId); return { id: entry.id, rank: entry.rank, name: entry.player.displayName, positions: entry.player.gameStats[0]?.observedPositions ?? [], team: entry.player.gameStats[0]?.team.code ?? null, gamesPlayed: stats?.gamesPlayed ?? null, average: displayTenths(stats?.averageTenths), points: displayTenths(stats?.totalTenths) }; })} /></section></aside>
        <section className="panel draft-player-pool"><div className="section-heading"><div><h2 className="display">Available {selected.sport} players</h2><p className="muted">{draft.status === "PAUSED" ? "Queue changes remain available while selections are paused." : myTurn ? "Your franchise is on the clock." : "Drafting unlocks when your franchise is on the clock."}</p></div>{context.role === "COMMISSIONER" && draft.status === "ACTIVE" && plan?.method !== "AUCTION" && <form action={autoPickAction.bind(null, id, draft.id)}><button className="button secondary">Auto-pick current team</button></form>}</div>
          {visiblePool ? <><form className="filter-bar" method="get"><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="draft" value={draft.id} /><input type="hidden" name="view" value="pool" /><label>Search <input name="q" defaultValue={query.q} /></label><label>POS <input name="position" defaultValue={query.position} /></label><button className="button secondary">Filter</button></form><div className="table-scroll"><table className="data-table player-pool-table"><thead><tr><th>Player</th><th>POS</th><th>TEAM</th><th>GP</th><th>AVG</th><th>PTS</th><th>PROJ</th><th>Actions</th></tr></thead><tbody>{players.map((player) => { const eligible = player.positions.length === 0 || selected.rosterSlots.some((slot) => fitsSlot(selected.sport, slot, new Set(player.positions))); const stats = statistics.get(player.id); return <tr key={player.id}><td><strong>{player.displayName}</strong></td><td><PositionBadges sport={selected.sport} positions={player.positions} />{player.positionSource === "Mapped" && <small className="position-provenance">Mapped</small>}</td><td>{player.displayTeam?.code ?? "N/A"}</td><td>{stats?.gamesPlayed ?? "N/A"}</td><td>{displayTenths(stats?.averageTenths)}</td><td>{displayTenths(stats?.totalTenths)}</td><td>N/A</td><td><div className="button-row"><form action={queuePlayerAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button compact secondary">Queue</button></form>{plan?.method === "AUCTION" ? <NominateAuctionForm leagueId={id} leagueSportId={selected.id} playerId={player.id} draftId={draft.id} disabled={!myTurn} /> : <form action={pickAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button compact primary" disabled={!myTurn || !eligible}>Draft</button></form>}</div></td></tr>; })}</tbody></table></div>{!players.length && <p className="muted">No available players match these filters.</p>}</> : <p className="muted">The player pool opens one hour before the saved start and closes when the draft completes.</p>}
        </section></div>}
      {view === "board" && <section className="panel"><div className="section-heading"><div><h2 className="display">Complete draft board</h2><p className="muted">Scroll horizontally for large leagues. Each selection shows its position and drafting franchise; salary remains N/A outside verified salary auctions.</p></div></div><div className="draft-board-scroll"><ol className="draft-order-list">{draft.pickOrder.map((teamId, index) => { const team = context.league.teams.find(({ id: value }) => value === teamId); const pick = draft.picks.find(({ overall }) => overall === index + 1); const complete = Boolean(pick); const active = index === draft.currentPick - 1 && ["ACTIVE", "PAUSED"].includes(draft.status); return <li key={`${teamId}-${index}`} className={`${complete ? "complete" : ""} ${active ? "active" : ""} ${(pick?.teamId ?? teamId) === myTeamId ? "mine" : ""}`}><span>{index + 1}</span><strong>{(pick && recaps.get(pick.id)?.playerName) ?? pick?.player.displayName ?? team?.name ?? "Unknown"}</strong>{pick && <PositionBadges sport={pick.player.sport} positions={recaps.get(pick.id)?.positions ?? pick.player.gameStats[0]?.observedPositions ?? []} />}<small>{pick ? `${recaps.get(pick.id)?.franchiseName ?? `Franchise ${pick.teamId} (historical name unavailable)`}${pick.automatic ? " · Auto" : ""}${recaps.get(pick.id)?.price != null ? ` · $${recaps.get(pick.id)!.price}` : ""}${recaps.get(pick.id)?.originalTeamId !== pick.teamId && recaps.has(pick.id) ? ` · Original slot: ${recaps.get(pick.id)!.originalTeamName}` : ""}` : team?.isComputer ? "Computer" : teamId === myTeamId ? "My franchise" : "Upcoming"}</small></li>; })}</ol></div></section>}
      {view === "results" && draft.status === "COMPLETE" && <section className="panel"><h2 className="display">Draft results</h2><ol className="pick-list">{draft.picks.map((pick) => {
        const recap = recaps.get(pick.id);
        return <li key={pick.id}><span>{pick.overall}</span><strong>{recap?.playerName ?? pick.player.displayName}</strong><PositionBadges sport={recap?.sport ?? pick.player.sport} positions={recap?.positions ?? []} /><small>{recap?.franchiseName ?? `Franchise ${pick.teamId} (historical name unavailable)`} · {recap?.price != null ? `$${recap.price}` : `Round ${pick.round}, pick ${pick.roundPick}`}{recap && recap.originalTeamId !== pick.teamId ? ` · Original slot: ${recap.originalTeamName}` : ""}</small></li>;
      })}</ol><p className="muted">Recorded draft selections. Later ownership and roster changes do not rewrite this recap.</p><div className="button-row"><Link className="button primary" href={`/leagues/${id}/team?sport=${selected.sport}`}>My Team</Link><Link className="button secondary" href={`/leagues/${id}`}>League overview</Link></div></section>}
    </>}
  </LeagueShell>;
}
