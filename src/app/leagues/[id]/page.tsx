import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { SportTags } from "@/components/sports";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";

export const metadata: Metadata = { title: "League overview" };

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const { league } = context; const sports = league.sports.map(({ sport }) => sport); const database = getDatabase();
  const [cycle, commissioner, assignments] = await Promise.all([
    database.championshipCycle.findFirst({ where: { leagueId: id }, orderBy: { number: "desc" } }),
    database.leagueMember.findFirst({ where: { leagueId: id, role: "COMMISSIONER" }, include: { user: true } }),
    database.leagueSportSeason.findMany({ where: { leagueSport: { leagueId: id } }, orderBy: { assignedAt: "desc" }, include: { leagueSport: true } }),
  ]);
  const activeDraft = league.drafts.find(({ status }) => status === "ACTIVE" || status === "PAUSED");
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><Link href="/dashboard" className="text-link">My leagues</Link><h1 className="display">{league.name}</h1><SportTags values={sports} />{activeDraft && <p><Link className="button primary" href={`/leagues/${id}/draft?sport=${activeDraft.sport}&draft=${activeDraft.id}`}>{activeDraft.status === "PAUSED" ? "Resume draft" : "Join live draft"}</Link></p>}</div>
    <section className="panel" aria-labelledby="league-summary"><div className="section-heading"><h2 className="display" id="league-summary">League overview</h2></div><div className="overview-grid">
      <p><strong>Format</strong><br />{league.format === "DYNASTY" ? "Dynasty" : league.sports.some(({ keeperLimit }) => keeperLimit > 0) ? "Redraft with keepers" : "Redraft"}</p>
      <p><strong>Competition</strong><br />{league.competitionType === "HEAD_TO_HEAD" ? "Head-to-head" : "Cumulative"}</p>
      <p><strong>Franchises</strong><br />{league.teams.length} of {league.maxTeams}</p>
      <p><strong>Commissioner</strong><br />{commissioner?.user.name ?? "Unavailable"}</p>
      <p><strong>Championship cycle</strong><br />{cycle ? `${cycle.label} · ${cycle.status.toLowerCase()}` : "Pending configuration"}</p>
      <p><strong>Visibility</strong><br />{league.visibility === "PUBLIC" ? "Public" : "Private"}</p>
    </div></section>
    <section aria-labelledby="franchise-sports"><div className="section-heading"><h2 className="display" id="franchise-sports">Sports and seasons</h2></div><div className="card-grid">{league.sports.map((item) => {
      const roster = context.fantasyTeam?.sportRosters.find(({ sport }) => sport === item.sport); const draft = league.drafts.find(({ sport }) => sport === item.sport);
      const assignment = assignments.find(({ leagueSportId }) => leagueSportId === item.id);
      return <article className="panel" key={item.id}><p className="eyebrow">{item.sport} · {item.seasonLabel}</p><h3>{assignment ? assignment.status.replaceAll("_", " ").toLowerCase() : "Season pending"}</h3><p className="muted">{draft ? `Draft ${draft.status.toLowerCase()}` : "Draft not started"}{roster ? ` · ${roster.entries.length} active players` : ""}</p><div className="button-row"><Link className="button secondary" href={`/leagues/${id}/team?sport=${item.sport}`}>Roster</Link><Link className="button secondary" href={`/leagues/${id}/standings?sport=${item.sport}`}>Standings</Link></div></article>;
    })}</div></section>
  </LeagueShell>;
}
