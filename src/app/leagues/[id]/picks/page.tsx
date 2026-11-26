import { financePolicy } from "@/server/finance";
import { getDatabase } from "@/lib/db";
import { hasGameplayTable } from "@/server/gameplay-storage";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FuturePickCorrectionForm, RookieDraftForm } from "@/components/rookie-draft-form";
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
  if ((await financePolicy(getDatabase(), id))?.salaryMode) redirect(`/leagues/${id}/finances`);
  const sport = await resolveLeagueSport(id, query.sport);
  const rookiePlan = await hasGameplayTable("DraftPlan") ? await getDatabase().draftPlan.findUnique({ where: { leagueSportId_seasonId_kind: { leagueSportId: sport.id, seasonId: sport.seasonId, kind: "ROOKIE" } } }) : null;
  const rule = await hasGameplayTable("RookieDraftRule") ? await getDatabase().rookieDraftRule.findUnique({ where: { leagueSportId: sport.id } }) : null;
  const picks = await listFutureDraftPicks(user.id, id, sport.id, true);
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro">
      <h1 className="display">{sport.sport} future draft picks</h1>
      <LeagueSportTabs leagueId={id} path="/picks" sports={context.league.sports.map((item) => item.sport)} selected={sport.sport} />
    </div>
    <section className="panel">
      {context.role === "COMMISSIONER" && (context.league.status === "SETUP"
        ? <p className="muted">Finalize franchise setup before granting picks.</p>
        : <FuturePickGrantForm key={sport.id} leagueId={id} leagueSportId={sport.id} />)}
      {context.role === "COMMISSIONER" && context.league.status !== "SETUP" && <RookieDraftForm current={rookiePlan ? { version: rookiePlan.version, scheduledAt: rookiePlan.scheduledAt?.toISOString() ?? null, secondsPerPick: rookiePlan.secondsPerPick } : undefined} rounds={rule?.rounds ?? 4} leagueId={id} leagueSportId={sport.id} teams={context.league.teams} />}
      <Link href={`/leagues/${id}/draft?sport=${sport.sport}`}>Open {sport.sport} draft room</Link>
      {picks.length ? <table className="data-table">
        <thead><tr><th>Season start year</th><th>Round</th><th>Original franchise</th><th>Current owner</th><th>State and history</th><th>Administration</th></tr></thead>
        <tbody>{picks.map((pick) => <tr key={pick.id}>
          <td>{pick.seasonStartYear}</td><td>{pick.round}</td><td>{pick.originalTeam.name}</td><td>{pick.ownerTeam.name}</td>
          <td>{pick.state === "CONSUMED" ? "Consumed" : pick.state === "EXPIRED" ? "Expired unused entitlement" : pick.state === "INACTIVE" ? "Outside configured draft rounds" : "Available"}<details><summary>Ownership history</summary><ul>{pick.ownership.map((event) => <li key={event.id}>{event.recordedAt.toISOString()} · {event.reason} · {context.league.teams.find(({ id }) => id === event.ownerTeamId)?.name}</li>)}</ul></details></td>
          <td>{context.role === "COMMISSIONER" && pick.state === "AVAILABLE" && <FuturePickCorrectionForm leagueId={id} pickId={pick.id} ownerTeamId={pick.ownerTeamId} teams={context.league.teams} />}</td>
        </tr>)}</tbody>
      </table> : <p className="muted">Future picks have not been granted for this sport.</p>}
    </section>
  </LeagueShell>;
}
