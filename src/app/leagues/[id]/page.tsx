import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { SportTags } from "@/components/sports";
import { InviteLinkForm } from "@/components/invite-link-form";
import { DraftScheduleStatus } from "@/components/draft-schedule-status";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";
import { financePolicy } from "@/server/finance";
import { draftRoomState, listDraftPlans } from "@/server/draft-plans";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params;
  const context = await leagueContext(user.id, id); if (!context) notFound();
  const { league } = context; const database = getDatabase();
  const [commissioner, plans] = await Promise.all([
    database.leagueMember.findFirst({ where: { leagueId: id, role: "COMMISSIONER" }, include: { user: true } }),
    listDraftPlans(id),
  ]);
  const financial = await financePolicy(database, id);
  const currentPlans = plans.filter((plan) => league.sports.some((sport) => sport.id === plan.leagueSportId && sport.seasonId === plan.seasonId));
  const now = new Date();
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><Link href="/dashboard">My leagues</Link><h1 className="display">{league.name}</h1><SportTags values={league.sports.map(({ sport }) => sport)} /></div>
    <div className="league-overview-layout">
      <section className="panel"><h2 className="display">League overview</h2><dl className="overview-grid">
        <div><dt>Format</dt><dd>{financial?.salaryMode ? "Salary dynasty" : league.format === "DYNASTY" ? "Dynasty" : league.sports.some(({ keeperLimit }) => keeperLimit > 0) ? "Redraft with keepers" : "Redraft"}</dd></div>
        <div><dt>Competition</dt><dd>{league.competitionType === "HEAD_TO_HEAD" ? "Head-to-head" : "Cumulative"}</dd></div>
        <div><dt>Franchises</dt><dd>{league.teams.length} of {league.maxTeams}</dd></div>
        <div><dt>Commissioner</dt><dd>{commissioner?.user.name ?? "Unavailable"}</dd></div>
        <div><dt>Seasons</dt><dd>{league.sports.map((sport) => sport.sport + " " + sport.seasonLabel).join(" · ")}</dd></div>
        <div><dt>Visibility</dt><dd>{league.visibility === "PRIVATE" ? "Private invitation only" : "Public"}</dd></div>
      </dl><div className="overview-sports">{league.sports.map((sport) => {
        const plan = currentPlans.find((plan) => plan.leagueSportId === sport.id || plan.scope === "UNIVERSAL");
        const draft = league.drafts.find((draft) => draft.sport === sport.sport && draft.seasonId === sport.seasonId);
        const state = plan ? draftRoomState(plan, now) : draft?.status ?? "UNSCHEDULED";
        const open = ["ROOM_OPEN", "AWAITING_START", "IN_PROGRESS", "ACTIVE", "PAUSED", "BLOCKED"].includes(state);
        return <article key={sport.id} className="mini-card"><h3>{sport.sport} {sport.seasonLabel}</h3>
          {plan ? <DraftScheduleStatus scheduledAt={plan.scheduledAt?.toISOString() ?? null} timezone={plan.timezone} status={state} refresh /> : <p>Draft: {state.toLowerCase().replaceAll("_", " ")}</p>}
          {plan?.blockedReason && <p role="alert">{plan.blockedReason}</p>}
          <Link className={"button " + (open ? "primary" : "secondary")} href={"/leagues/" + id + "/draft?sport=" + sport.sport}>{open ? "Join Draft Room" : "Draft center"}</Link>
        </article>;
      })}</div></section>
      <aside className="overview-side">
        {context.role === "COMMISSIONER" ? <InviteLinkForm leagueId={id} /> : <section className="panel"><h2 className="display">Invitations</h2><p>Ask your commissioner for a private invitation link. Existing members retain access when draft schedules change.</p></section>}
        <section className="panel"><h2 className="display">Upcoming events</h2>
          {currentPlans.filter((plan) => plan.scheduledAt && plan.scheduledAt > now && !["CANCELLED", "COMPLETED"].includes(plan.status)).map((plan) => <p key={plan.id}>{plan.leagueSport.sport} draft · {plan.scheduledAt!.toISOString()} UTC</p>)}
          {league.sports.filter((sport) => sport.keeperDeadline && sport.keeperDeadline > now).map((sport) => <p key={sport.id}>{sport.sport} keeper deadline · {sport.keeperDeadline!.toISOString()} UTC</p>)}
          {!currentPlans.some((plan) => plan.scheduledAt && plan.scheduledAt > now) && <p>No future draft is scheduled. Professional dates remain pending where unverified.</p>}
        </section>
      </aside>
    </div>
  </LeagueShell>;
}
