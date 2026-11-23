import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { SportTags } from "@/components/sports";
import { requireSession } from "@/lib/auth";
import { getMemberLeague, listDemoPlayers } from "@/server/dashboard";

export const metadata: Metadata = { title: "League overview" };

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const membership = await getMemberLeague(user.id, id);
  if (!membership) notFound();

  const { league } = membership;
  const sports = league.sports.map(({ sport }) => sport);
  const players = league.isDemo ? await listDemoPlayers() : [];

  return (
    <LeagueShell leagueId={id}>
        <div className="workspace-intro">
          <Link href="/dashboard" className="text-link">My leagues</Link>
          <h1 className="display">{league.name}</h1>
          <p className="muted">{league.format === "DYNASTY" ? "Dynasty" : "Redraft"} · {league._count.members} of {league.maxTeams} managers</p>
          <SportTags values={sports} />
        </div>
        <div className="league-details">
          <section className="panel" aria-labelledby="preset-title">
            <h2 className="display" id="preset-title">Scoring preset</h2>
            <p>{league.preset.name}</p>
            {league.preset.experimental && (
              <p className="muted">Experimental · Cross-sport balance is pending validation.</p>
            )}
            {sports.map((sport) => (
              <details key={sport} className="scoring-rules">
                <summary>{sport} scoring weights</summary>
                <table>
                  <thead><tr><th scope="col">Stat</th><th scope="col">Points</th></tr></thead>
                  <tbody>
                    {league.preset.rules.filter((rule) => rule.sport === sport).map((rule) => (
                      <tr key={rule.id}><td>{rule.statKey}</td><td>{rule.coefficient.toFixed(1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </section>
          {league.isDemo && (
            <section className="panel" aria-labelledby="players-title">
              <h2 className="display" id="players-title">Sample player pool</h2>
              <ul className="player-list">
                {players.map((player) => (
                  <li key={player.id}><span>{player.displayName}</span><span className="tag">{player.sport}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
    </LeagueShell>
  );
}
