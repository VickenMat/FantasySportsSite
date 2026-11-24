import { notFound } from "next/navigation";
import { autoPickAction, draftPauseAction, pickAction, queuePlayerAction, startDraftAction } from "@/app/actions/leagues";
import { DraftClock } from "@/components/draft-clock";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { availablePlayers } from "@/server/draft";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function DraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string; draft?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound(); const selected = await resolveLeagueSport(id, query.sport);
  const draft = await getDatabase().draft.findFirst({ where: { leagueId: id, sport: selected.sport, ...(query.draft ? { id: query.draft } : {}) }, orderBy: { createdAt: "desc" }, include: {
    picks: { orderBy: { overall: "asc" }, include: { player: true, team: true } },
    queue: { where: context.fantasyTeam ? { teamId: context.fantasyTeam.id } : undefined, orderBy: { rank: "asc" }, include: { player: true } },
  } });
  const players = draft?.status === "ACTIVE" ? await availablePlayers(id, "", undefined, 100, selected.sport) : [];
  const currentTeamId = draft?.status === "ACTIVE" ? draft.pickOrder[draft.currentPick - 1] : null;
  const currentTeam = context.league.teams.find(({ id: teamId }) => teamId === currentTeamId);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Live draft room</p><h1 className="display">{selected.sport} draft</h1>
    <LeagueSportTabs leagueId={id} path="/draft" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} />
    {draft && <><p className="muted">{draft.status} · Pick {Math.min(draft.currentPick, draft.pickOrder.length)} of {draft.pickOrder.length} · {currentTeam?.name ?? "Complete"}</p><DraftClock status={draft.status} pickStartedAt={draft.pickStartedAt?.toISOString() ?? null} secondsPerPick={draft.secondsPerPick} version={draft.version} />
      {context.role === "COMMISSIONER" && ["ACTIVE", "PAUSED"].includes(draft.status) && <form action={draftPauseAction.bind(null, id, draft.id, draft.status === "ACTIVE")}><button className="button secondary">{draft.status === "ACTIVE" ? "Pause draft" : "Resume draft"}</button></form>}</>}
  </div>
  {!draft && context.role === "COMMISSIONER" && <section className="panel"><h2 className="display">Ready the {selected.sport} room</h2><p className="muted">This sport drafts independently. The server persists the clock, queue, pick order, and reconnect state.</p><form action={startDraftAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><button className="button primary">Start {selected.sport} snake draft</button></form></section>}
  {draft && <div className="draft-layout"><section className="panel"><h2 className="display">Draft board</h2><ol className="pick-list">{draft.picks.map((pick) => <li key={pick.id}><span>{pick.overall}</span><strong>{pick.player.displayName}</strong><span className="muted">{pick.team.name}{pick.automatic ? " · Auto" : ""}</span></li>)}</ol>{draft.queue.length > 0 && <><h3>My queue</h3><ol className="pick-list">{draft.queue.map((entry) => <li key={entry.id}><span>{entry.rank}</span><strong>{entry.player.displayName}</strong></li>)}</ol></>}</section>
    {draft.status === "ACTIVE" && <section className="panel"><h2 className="display">Available {selected.sport} players</h2>{context.role === "COMMISSIONER" && <form action={autoPickAction.bind(null, id, draft.id)}><button className="button secondary">Auto-pick current team</button></form>}<ul className="player-list">{players.map((player) => <li key={player.id}><span>{player.displayName}<small>{player.positions.join(", ")}</small></span><div className="button-row"><form action={queuePlayerAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button secondary">Queue</button></form><form action={pickAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button primary">Draft</button></form></div></li>)}</ul></section>}</div>}
  </LeagueShell>;
}
