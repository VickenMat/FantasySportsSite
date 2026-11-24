import { notFound } from "next/navigation";
import { advanceReplayAction, playoffsAction, scheduleAction, recalculateAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";
import { formatScore } from "@/scoring/engine";

export default async function MatchupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const matchups = await getDatabase().matchup.findMany({ where: { leagueId: id }, include: { period: true, homeTeam: true, awayTeam: true }, orderBy: [{ period: { number: "asc" } }, { homeTeam: { name: "asc" } }] });
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Head-to-head</p><h1 className="display">Matchups</h1><p className="muted">Scores are recalculated from the versioned score ledger. Historical results are labeled replay data.</p></div>
    {context.role === "COMMISSIONER" && <div className="button-row">{!matchups.length && <form action={scheduleAction.bind(null, id)}><button className="button primary">Generate schedule</button></form>}<form action={recalculateAction.bind(null, id)}><button className="button secondary">Recalculate from ledger</button></form>{matchups.length > 0 && <form action={playoffsAction.bind(null, id)}><button className="button secondary">Generate next playoff round</button></form>}{context.league.isHistorical && matchups.length > 0 && <form action={advanceReplayAction.bind(null, id)}><button className="button primary">Advance historical period</button></form>}</div>}
    <div className="card-grid">{matchups.map((matchup) => <article className="panel matchup" key={matchup.id}><p className="eyebrow">{matchup.isPlayoff ? `Playoff round ${matchup.playoffRound}` : `Period ${matchup.period.number}`} · {matchup.status}</p><div><span>{matchup.homeTeam.name}</span><strong>{formatScore(matchup.homeTenths)}</strong></div><div><span>{matchup.awayTeam.name}</span><strong>{formatScore(matchup.awayTenths)}</strong></div></article>)}</div>
    {!matchups.length && <div className="empty-card"><h3>No schedule yet</h3><p className="muted">A commissioner can generate a round-robin schedule after teams are ready.</p></div>}
  </LeagueShell>;
}
