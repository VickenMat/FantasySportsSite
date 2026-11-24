import { notFound } from "next/navigation";
import { advanceReplayAction, playoffsAction, recalculateAction, scheduleAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { formatScore } from "@/scoring/engine";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function MatchupsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound(); const selected = await resolveLeagueSport(id, query.sport);
  const matchups = await getDatabase().matchup.findMany({ where: { leagueId: id, sport: selected.sport }, include: { period: true, homeTeam: true, awayTeam: true }, orderBy: [{ period: { number: "asc" } }, { homeTeam: { name: "asc" } }] });
  const sportField = <input type="hidden" name="sport" value={selected.sport} />;
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Head-to-head</p><h1 className="display">{selected.sport} matchups</h1><p className="muted">Scores use this sport’s immutable V9 ledger. Historical results are labeled replay data.</p><LeagueSportTabs leagueId={id} path="/matchups" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    {context.role === "COMMISSIONER" && <div className="button-row">{!matchups.length && <form action={scheduleAction.bind(null, id)}>{sportField}<button className="button primary">Generate schedule</button></form>}<form action={recalculateAction.bind(null, id)}>{sportField}<button className="button secondary">Recalculate from ledger</button></form>{matchups.length > 0 && <form action={playoffsAction.bind(null, id)}>{sportField}<button className="button secondary">Generate next playoff round</button></form>}{context.league.isHistorical && matchups.length > 0 && <form action={advanceReplayAction.bind(null, id)}>{sportField}<button className="button primary">Advance historical period</button></form>}</div>}
    <div className="card-grid">{matchups.map((matchup) => <article className="panel matchup" key={matchup.id}><p className="eyebrow">{matchup.isPlayoff ? `Playoff round ${matchup.playoffRound}` : `Period ${matchup.period.number}`} · {matchup.status}</p><div><span>{matchup.homeTeam.name}</span><strong>{formatScore(matchup.homeTenths)}</strong></div><div><span>{matchup.awayTeam.name}</span><strong>{formatScore(matchup.awayTenths)}</strong></div></article>)}</div>
    {!matchups.length && <div className="empty-card"><h3>No {selected.sport} schedule yet</h3><p className="muted">A commissioner can generate it once franchises are ready.</p></div>}
  </LeagueShell>;
}
