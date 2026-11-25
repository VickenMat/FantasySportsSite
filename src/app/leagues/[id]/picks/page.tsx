import { notFound } from "next/navigation";
import { FuturePickGrantForm } from "@/components/future-pick-grant-form";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { requireSession } from "@/lib/auth";
import { listFutureDraftPicks } from "@/server/dynasty-picks";
import { leagueContext, resolveLeagueSport } from "@/server/league";

export default async function FuturePicksPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sport?: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const context = await leagueContext(user.id, id);
  if (!context || context.league.format !== "DYNASTY") notFound();
  const sport = await resolveLeagueSport(id, query.sport);
  const picks = await listFutureDraftPicks(user.id, id, sport.id);
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro">
      <h1 className="display">{sport.sport} future draft picks</h1>
      <LeagueSportTabs leagueId={id} path="/picks" sports={context.league.sports.map((item) => item.sport)} selected={sport.sport} />
    </div>
    <section className="panel">
      {context.role === "COMMISSIONER" && (context.league.status === "SETUP"
        ? <p className="muted">Finalize franchise setup before granting picks.</p>
        : <FuturePickGrantForm key={sport.id} leagueId={id} leagueSportId={sport.id} />)}
      {picks.length ? <table className="data-table">
        <thead><tr><th>Season start year</th><th>Round</th><th>Original franchise</th><th>Current owner</th></tr></thead>
        <tbody>{picks.map((pick) => <tr key={pick.id}>
          <td>{pick.seasonStartYear}</td><td>{pick.round}</td><td>{pick.originalTeam.name}</td><td>{pick.ownerTeam.name}</td>
        </tr>)}</tbody>
      </table> : <p className="muted">Future picks have not been granted for this sport.</p>}
    </section>
  </LeagueShell>;
}
