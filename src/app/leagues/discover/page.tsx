import { DashboardHeader } from "@/components/dashboard-header";
import { SportTags } from "@/components/sports";
import { joinPublicLeagueAction } from "@/app/actions/leagues";
import { requireSession } from "@/lib/auth";
import { listPublicLeagues } from "@/server/league";

export default async function DiscoverLeaguesPage() {
  const { user } = await requireSession(); const leagues = await listPublicLeagues(user.id);
  return <><DashboardHeader /><main id="main" className="shell workspace"><div className="workspace-intro"><p className="eyebrow">League directory</p><h1 className="display">Discover public leagues</h1><p className="muted">Only public leagues still in setup appear here. Private leagues require an invitation.</p></div>
    {leagues.length ? <ul className="league-list">{leagues.map((league) => <li className="league-entry" key={league.id}><div className="league-title"><h2>{league.name}</h2><p className="muted">{league.format === "DYNASTY" ? "Dynasty" : "Redraft / keeper"} · {league._count.members} of {league.maxTeams} managers</p></div><SportTags values={league.sports.map(({ sport }) => sport)} /><form action={joinPublicLeagueAction.bind(null, league.id)}><button className="button primary">Join league</button></form></li>)}</ul> : <div className="empty-card"><h2>No open public leagues</h2><p className="muted">Create one or use a private invitation link.</p></div>}
  </main></>;
}
