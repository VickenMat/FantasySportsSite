import { randomUUID } from "node:crypto";
import { AdministrationForm } from "@/components/administration-form";
import { hasSeasonScopedSchedules } from "@/server/gameplay-storage";
import { notFound } from "next/navigation";
import { advanceReplayAction, playoffsAction, recalculateAction, scheduleAction } from "@/app/actions/leagues";
import { ProfessionalDataStatus } from "@/components/professional-data-status";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { formatScore } from "@/scoring/engine";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function MatchupsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound(); const selected = await resolveLeagueSport(id, query.sport);
  const competition = await getDatabase().sportCompetition.findFirst({ where: { leagueId: id, sport: selected.sport, leagueSportSeason: { seasonId: selected.seasonId } }, include: { configSnapshot: true } });
  const database = getDatabase();
  const scoped = await hasSeasonScopedSchedules();
  const [matchups, relativePeriods] = await Promise.all([
    database.matchup.findMany({ where: { leagueId: id, sport: selected.sport }, include: { period: true, homeTeam: true, awayTeam: true }, orderBy: [{ period: { number: "asc" } }, { homeTeam: { name: "asc" } }] }),
    database.relativeMatchupPeriod.findMany({ where: { leagueSportId: selected.id, ...(scoped ? { seasonId: selected.seasonId } : {}) }, orderBy: { number: "asc" }, select: { id: true, number: true,
      matchups: { orderBy: { homeTeam: { name: "asc" } }, include: { homeTeam: true, awayTeam: true } },
    } }),
  ]);
  const correctionPeriods = context.role === "COMMISSIONER" && competition && !competition.finalizedAt ? await database.scoringPeriod.findMany({ where: { competitionId: competition.id, lineupSnapshots: { some: { isStarter: true } } }, orderBy: { number: "asc" } }) : [];
  const sportField = <input type="hidden" name="sport" value={selected.sport} />;
  const cumulative = context.league.competitionType === "CUMULATIVE";
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">{cumulative ? "Cumulative competition" : "Independent head-to-head"}</p><h1 className="display">{selected.sport} {cumulative ? "scoring periods" : "matchups"}</h1><p className="muted">Scores use this sport’s immutable V9 ledger. Competition state: {competition?.status ?? "PENDING_DATA"}.</p><LeagueSportTabs leagueId={id} path="/matchups" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    <ProfessionalDataStatus sport={selected.sport} seasonId={selected.seasonId} historical={context.league.isHistorical} />
    {competition?.statusReason && <section className="notice" role="status">{competition.statusReason}</section>}
    {context.role === "COMMISSIONER" && <div className="button-row">{!matchups.length && <form action={scheduleAction.bind(null, id)}>{sportField}<button className="button primary">{context.league.isHistorical ? "Generate replay schedule" : "Provision authoritative schedule"}</button></form>}{!cumulative && <form action={recalculateAction.bind(null, id)}>{sportField}<button className="button secondary">Recalculate from ledger</button></form>}{!cumulative && matchups.length > 0 && <form action={playoffsAction.bind(null, id)}>{sportField}<button className="button secondary">Generate next playoff round</button></form>}{context.league.isHistorical && matchups.length > 0 && <form action={advanceReplayAction.bind(null, id)}>{sportField}<button className="button primary">Advance historical period</button></form>}</div>}
    {correctionPeriods.length > 0 && <details className="panel"><summary>Audited score correction</summary><p>Enter a signed adjustment in tenths of a point. Reversal uses an equal opposite adjustment. Original V9 scores and captured lineups remain preserved; finalized results are frozen.</p><AdministrationForm leagueId={id} operation="SCORE" label="Record score adjustment"><input type="hidden" name="requestId" value={randomUUID()} /><label>Scoring period<select name="periodId">{correctionPeriods.map((period) => <option key={period.id} value={period.id}>{selected.sport} period {period.number}</option>)}</select></label><label>Franchise<select name="teamId">{context.league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Signed correction (tenths)<input type="number" name="deltaTenths" step="1" required /></label><label>Reason<input name="reason" minLength={10} required /></label></AdministrationForm></details>}
    <div className="card-grid">{matchups.map((matchup) => <article className="panel matchup" key={matchup.id}><p className="eyebrow">{matchup.isPlayoff ? `Playoff round ${matchup.playoffRound}` : `Period ${matchup.period.number}`} · {matchup.status}</p><div><span>{matchup.homeTeam.name}</span><strong>{matchup.status === "SKIPPED" ? "—" : formatScore(matchup.homeTenths)}</strong></div><div><span>{matchup.awayTeam.name}</span><strong>{matchup.status === "SKIPPED" ? "—" : formatScore(matchup.awayTenths)}</strong></div>{matchup.status === "SKIPPED" && <p className="muted">All assigned games were cancelled. No win, loss or tie is recorded.</p>}</article>)}</div>
    {!matchups.length && relativePeriods.length > 0 && <section className="panel"><h2 className="display">Opponent schedule</h2><p className="muted">Opponent rotation is confirmed. Calendar dates and scoring remain pending authoritative professional periods.</p><div className="card-grid">{relativePeriods.flatMap((period) => period.matchups.map((matchup) => <article className="mini-card" key={matchup.id}><span>Relative period {period.number}</span><strong>{matchup.homeTeam.name} vs {matchup.awayTeam.name}</strong><small>Calendar pending</small></article>))}</div></section>}
    {!matchups.length && !relativePeriods.length && <div className="empty-card"><h3>{cumulative ? "No head-to-head matchups in cumulative competition" : `No ${selected.sport} matchups yet`}</h3><p className="muted">{cumulative ? "Rankings use eligible starting-lineup UBP; cumulative leagues never create fantasy playoffs or championship points." : "The opponent sequence is generated when this sport's draft completes; calendar dates bind later from authoritative data."}</p></div>}
  </LeagueShell>;
}
