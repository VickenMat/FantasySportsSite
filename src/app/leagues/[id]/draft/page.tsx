import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { availablePlayers } from "@/server/draft";
import { leagueContext } from "@/server/league";
import { autoPickAction, pickAction, queuePlayerAction, startDraftAction } from "@/app/actions/leagues";
import { getDatabase } from "@/lib/db";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const draft = await getDatabase().draft.findFirst({ where: { leagueId: id }, orderBy: { createdAt: "desc" }, include: { picks: { orderBy: { overall: "asc" }, include: { player: true, team: true } }, queue: { where: context.fantasyTeam ? { teamId: context.fantasyTeam.id } : undefined, orderBy: { rank: "asc" }, include: { player: true } } } });
  const players = draft?.status === "ACTIVE" ? await availablePlayers(id) : [];
  const currentTeamId = draft?.status === "ACTIVE" ? (() => { const i = draft.currentPick - 1, round = Math.floor(i / draft.order.length), offset = i % draft.order.length; return draft.order[round % 2 ? draft.order.length - 1 - offset : offset]; })() : null;
  const currentTeam = context.league.teams.find(({ id }) => id === currentTeamId);
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Live draft room</p><h1 className="display">{context.league.name} draft</h1>{draft && <p className="muted">{draft.status} · Pick {draft.currentPick} · {currentTeam?.name ?? "Complete"}</p>}</div>
    {!draft && context.role === "COMMISSIONER" && <section className="panel"><h2 className="display">Ready the room</h2><p className="muted">The server controls pick order, ownership, and completion. Computer teams support local demonstration drafts.</p><form action={startDraftAction.bind(null, id)}><button className="button primary">Start snake draft</button></form></section>}
    {draft && <div className="draft-layout"><section className="panel"><h2 className="display">Draft board</h2><ol className="pick-list">{draft.picks.map((pick) => <li key={pick.id}><span>{pick.overall}</span><strong>{pick.player.displayName}</strong><span className="muted">{pick.team.name}{pick.automatic ? " · Auto" : ""}</span></li>)}</ol>{draft.queue.length > 0 && <><h3>My queue</h3><ol className="pick-list">{draft.queue.map((entry) => <li key={entry.id}><span>{entry.rank}</span><strong>{entry.player.displayName}</strong></li>)}</ol></>}</section>
    {draft.status === "ACTIVE" && <section className="panel"><h2 className="display">Available</h2>{context.role === "COMMISSIONER" && <form action={autoPickAction.bind(null, id, draft.id)}><button className="button secondary">Auto-pick current team</button></form>}<ul className="player-list">{players.slice(0, 80).map((player) => <li key={player.id}><span>{player.displayName}<small>{player.positions.join(", ")}</small></span><div className="button-row"><form action={queuePlayerAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button secondary">Queue</button></form><form action={pickAction.bind(null, id, draft.id)}><input type="hidden" name="playerId" value={player.id} /><button className="button primary">Draft</button></form></div></li>)}</ul></section>}</div>}
  </LeagueShell>;
}
