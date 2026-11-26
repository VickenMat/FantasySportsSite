import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard-header";
import { SportTags } from "@/components/sports";
import { requireSession } from "@/lib/auth";
import { listMemberLeagues } from "@/server/dashboard";
import { listDraftPlans } from "@/server/draft-plans";
import { DraftScheduleStatus } from "@/components/draft-schedule-status";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { user } = await requireSession();
  const memberships = await listMemberLeagues(user.id);
  const draftPlans = new Map(await Promise.all(memberships.map(async ({ league }) => [league.id, await listDraftPlans(league.id)] as const)));

  return (
    <>
      <DashboardHeader />
      <main id="main" className="shell workspace">
        <div className="workspace-intro">
          <p className="eyebrow">Dashboard</p>
          <h1 className="display">Welcome, {user.name}</h1>
        </div>
        <section aria-labelledby="leagues-title">
          <div className="section-heading">
            <h2 className="display" id="leagues-title">My leagues</h2>
            <div className="button-row"><p className="muted">{memberships.length} {memberships.length === 1 ? "league" : "leagues"}</p><Link className="button secondary" href="/leagues/discover">Discover public leagues</Link><Link className="button primary" href="/leagues/new">Create league</Link></div>
          </div>
          {memberships.length ? (
            <ul className="league-list">
              {memberships.map(({ role, league }) => (
                <li key={league.id}>
                  <Link className="league-entry" href={`/leagues/${league.id}`}>
                    <span className="league-icon"><Trophy size={24} aria-hidden /></span>
                    <div className="league-title">
                      <h3>{league.name}</h3>
                      <p className="muted">{league.format === "DYNASTY" ? "Dynasty" : "Redraft"} · {league.maxTeams}-team format · {role === "COMMISSIONER" ? "Commissioner" : "Manager"}</p>
                      <p className="muted">{league.sports.map(({ sport, seasonLabel }) => `${sport} ${seasonLabel}`).join(" · ")}</p>
                      {(draftPlans.get(league.id) ?? []).filter((plan) => plan.scheduledAt && !["COMPLETED", "CANCELLED"].includes(plan.status)).map((plan) => <DraftScheduleStatus key={plan.id} scheduledAt={plan.scheduledAt!.toISOString()} timezone={plan.timezone} status={plan.status} />)}
                    </div>
                    <SportTags values={league.sports.map(({ sport }) => sport)} />
                    {league.isDemo && <span className="tag">Demo</span>}
                    <ChevronRight className="entry-chevron" size={20} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-card">
              <span className="league-icon"><Trophy size={24} aria-hidden /></span>
              <h3>No leagues yet</h3>
              <p className="muted">Your league memberships will appear here.</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
