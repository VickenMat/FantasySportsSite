import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { SportTags } from "@/components/sports";
import { requireSession } from "@/lib/auth";
import { listDemoPlayers } from "@/server/dashboard";
import { leagueContext } from "@/server/league";

export const metadata: Metadata = { title: "League overview" };

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const { league } = context; const sports = league.sports.map(({ sport }) => sport); const players = league.isDemo ? await listDemoPlayers() : [];
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><Link href="/dashboard" className="text-link">My leagues</Link><h1 className="display">{league.name}</h1><p className="muted">{league.format === "DYNASTY" ? "Dynasty" : league.sports.some(({ keeperLimit }) => keeperLimit > 0) ? "Redraft with keepers" : "Redraft"} · {league.teams.length} of {league.maxTeams} franchises · {league.visibility.toLowerCase()}</p><SportTags values={sports} /></div>
    <section aria-labelledby="franchise-sports"><div className="section-heading"><h2 className="display" id="franchise-sports">Franchise by sport</h2><p className="muted">Sport results remain separate until an evidence-backed aggregate championship model is defined.</p></div><div className="card-grid">{league.sports.map((item) => {
      const roster = context.fantasyTeam?.sportRosters.find(({ sport }) => sport === item.sport); const draft = league.drafts.find(({ sport }) => sport === item.sport);
      return <article className="panel" key={item.id}><p className="eyebrow">{item.sport} · {item.seasonLabel}</p><h3>{roster ? `${roster.entries.length} active players` : "Franchise roster"}</h3><p className="muted">{draft ? `Draft ${draft.status.toLowerCase()}` : "Draft not started"}{roster ? ` · ${roster.faabRemaining} FAAB` : ""}</p><div className="button-row"><Link className="button secondary" href={`/leagues/${id}/team?sport=${item.sport}`}>Roster</Link><Link className="button secondary" href={`/leagues/${id}/standings?sport=${item.sport}`}>Standings</Link></div></article>;
    })}</div></section>
    <div className="league-details"><section className="panel" aria-labelledby="preset-title"><h2 className="display" id="preset-title">Scoring preset</h2><p>{league.preset.name}</p>{league.preset.experimental && <p className="muted">Experimental · Cross-sport balance is pending validation.</p>}{sports.map((sport) => <details key={sport} className="scoring-rules"><summary>{sport} scoring weights</summary><table><thead><tr><th scope="col">Stat</th><th scope="col">Points</th></tr></thead><tbody>{league.preset.rules.filter((rule) => rule.sport === sport).map((rule) => <tr key={rule.id}><td>{rule.statKey}</td><td>{rule.coefficient.toFixed(1)}</td></tr>)}</tbody></table></details>)}</section>
      {league.isDemo && <section className="panel" aria-labelledby="players-title"><h2 className="display" id="players-title">Sample player pool</h2><ul className="player-list">{players.map((player) => <li key={player.id}><span>{player.displayName}</span><span className="tag">{player.sport}</span></li>)}</ul></section>}
    </div>
  </LeagueShell>;
}
