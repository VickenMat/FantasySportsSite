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
  const competition = await getDatabase().sportCompetition.findFirst({ where: { leagueId: id, sport: selected.sport }, include: { configSnapshot: true } });
  const matchups = await getDatabase().matchup.findMany({ where: { leagueId: id, sport: selected.sport }, include: { period: true, homeTeam: true, awayTeam: true }, orderBy: [{ period: { number: "asc" } }, { homeTeam: { name: "asc" } }] });
  const sportField = <input type="hidden" name="sport" value={selected.sport} />;
  const cumulative = context.league.competitionType === "CUMULATIVE";
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">{cumulative ? "Cumulative competition" : "Independent head-to-head"}</p><h1 className="display">{selected.sport} {cumulative ? "scoring periods" : "matchups"}</h1><p className="muted">Scores use this sport’s immutable V9 ledger. Competition state: {competition?.status ?? "PENDING_DATA"}.</p><LeagueSportTabs leagueId={id} path="/matchups" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    {competition?.statusReason && <section className="notice" role="status">{competition.statusReason}</section>}
    {context.role === "COMMISSIONER" && <div className="button-row">{!matchups.length && <form action={scheduleAction.bind(null, id)}>{sportField}<button className="button primary">{context.league.isHistorical ? "Generate replay schedule" : "Provision authoritative schedule"}</button></form>}{!cumulative && <form action={recalculateAction.bind(null, id)}>{sportField}<button className="button secondary">Recalculate from ledger</button></form>}{!cumulative && matchups.length > 0 && <form action={playoffsAction.bind(null, id)}>{sportField}<button className="button secondary">Generate next playoff round</button></form>}{context.league.isHistorical && matchups.length > 0 && <form action={advanceReplayAction.bind(null, id)}>{sportField}<button className="button primary">Advance historical period</button></form>}</div>}
    <div className="card-grid">{matchups.map((matchup) => <article className="panel matchup" key={matchup.id}><p className="eyebrow">{matchup.isPlayoff ? `Playoff round ${matchup.playoffRound}` : `Period ${matchup.period.number}`} · {matchup.status}</p><div><span>{matchup.homeTeam.name}</span><strong>{formatScore(matchup.homeTenths)}</strong></div><div><span>{matchup.awayTeam.name}</span><strong>{formatScore(matchup.awayTenths)}</strong></div></article>)}</div>
    {!matchups.length && <div className="empty-card"><h3>{cumulative ? "No head-to-head matchups in cumulative competition" : `No ${selected.sport} matchups yet`}</h3><p className="muted">{cumulative ? "Rankings use eligible starting-lineup UBP; cumulative leagues never create fantasy playoffs or championship points." : "A commissioner can provision periods after authoritative UTC games are available."}</p></div>}
  </LeagueShell>;
}
