import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { formatScore } from "@/scoring/engine";
import { getH2HChampionshipStandings } from "@/server/championships";
import { getCumulativeStandings } from "@/server/competition-scoring";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { standings } from "@/server/matchups";
import { getDatabase } from "@/lib/db";

export default async function StandingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const context = await leagueContext(user.id, id);
  if (!context) notFound();
  const sports = context.league.sports.map(({ sport }) => sport);
  const cumulative = context.league.competitionType === "CUMULATIVE";

  if (cumulative) {
    const combined = query.sport === "combined";
    const sport = combined ? undefined : (await resolveLeagueSport(id, query.sport)).sport;
    const result = await getCumulativeStandings(id, { sport });
    const pendingStarters = result.rows.reduce((total, team) => total + team.pendingStarters, 0);
    return <LeagueShell leagueId={id}>
      <div className="workspace-intro">
        <h1 className="display">{sport ?? "Combined"} cumulative standings</h1>
        <p className="muted">{result.cycle?.label ?? "Cycle pending"} · {result.state === "PENDING_DATA" ? "Awaiting scoring data" : result.state === "UPCOMING" ? "Upcoming" : "Provisional"}</p>
        <LeagueSportTabs leagueId={id} path="/standings" sports={sports} selected={sport ?? "combined"} combined={sports.length > 1} />
      </div>
      <section className="panel">
        {result.pendingSports > 0 && <p className="muted">Awaiting schedules for {result.pendingSports} sport(s).</p>}
        {result.pendingGames > 0 && <p className="muted">Awaiting lineup snapshots for {result.pendingGames} started game(s).</p>}
        {pendingStarters > 0 && <p className="muted">Awaiting ledger scores for {pendingStarters} captured starter appearance(s).</p>}
        <table className="data-table">
          <thead><tr><th>Rank</th><th>Team</th><th>UBP</th></tr></thead>
          <tbody>{result.rows.map((team) => <tr key={team.id}>
            <td>{team.rank ?? "—"}</td><td>{team.name}</td><td>{team.rank == null ? "Pending" : formatScore(team.pointsFor)}</td>
          </tr>)}</tbody>
        </table>
      </section>
    </LeagueShell>;
  }

  if (query.sport === "combined") {
    const championship = await getH2HChampionshipStandings(id);
    return <LeagueShell leagueId={id}>
      <div className="workspace-intro">
        <h1 className="display">Overall championship</h1>
        <p className="muted">{championship?.label ?? "Cycle pending"} · {championship?.status === "COMPLETE" ? "Final" : "Provisional"}</p>
        <LeagueSportTabs leagueId={id} path="/standings" sports={sports} selected="combined" combined />
      </div>
      <section className="panel">
        {championship?.championshipResults.length ? <table className="data-table">
          <thead><tr><th>Rank</th><th>Team</th><th>Championship points</th><th>Combined UBP</th></tr></thead>
          <tbody>{championship.championshipResults.map((row) => <tr key={row.teamId}>
            <td>{row.rank}</td><td>{row.team.name}</td>
            <td>{row.pointsDenominator === 1 ? row.pointsNumerator : `${row.pointsNumerator}/${row.pointsDenominator}`}</td>
            <td>{formatScore(row.combinedUbpTenths)}</td>
          </tr>)}</tbody>
        </table> : <p className="muted">Awaiting finalized sport placements.</p>}
      </section>
    </LeagueShell>;
  }

  const selected = await resolveLeagueSport(id, query.sport);
  const rows = await standings(id, selected.sport);
  const competition = await getDatabase().sportCompetition.findFirst({
    where: { leagueId: id, sport: selected.sport, leagueSportSeason: { seasonId: selected.seasonId } },
  });
  const pending = competition?.status === "PENDING_DATA";
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro">
      <p className="eyebrow">Sport head-to-head</p><h1 className="display">{selected.sport} standings</h1>
      <p className="muted">{competition?.status ?? "PENDING_DATA"}{competition?.statusReason ? ` · ${competition.statusReason}` : ""}</p>
      <LeagueSportTabs leagueId={id} path="/standings" sports={sports} selected={selected.sport} combined={sports.length > 1} />
    </div>
    <section className="panel">
      <table className="data-table">
        <thead><tr><th>Rank</th><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr></thead>
        <tbody>{rows.map((team) => <tr key={team.id}>
          <td>{pending ? "—" : team.rank}</td><td>{team.name}</td><td>{team.wins}</td><td>{team.losses}</td><td>{team.ties}</td>
          <td>{pending ? "Pending" : formatScore(team.pointsFor)}</td><td>{pending ? "Pending" : formatScore(team.pointsAgainst)}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </LeagueShell>;
}
