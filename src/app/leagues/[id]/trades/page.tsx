import { notFound } from "next/navigation";
import { cancelTradeAction, respondTradeAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { TradeBuilder } from "@/components/trade-builder";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";

export default async function TradesPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const context = await leagueContext(user.id, id);
  if (!context?.fantasyTeam) notFound();
  const database = getDatabase();
  const [teams, trades] = await Promise.all([
    database.fantasyTeam.findMany({ where: { leagueId: id }, orderBy: { name: "asc" }, include: { sportRosters: { include: { leagueSport: true, entries: { where: { releasedAt: null }, orderBy: { player: { displayName: "asc" } }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } } } } } } }),
    database.trade.findMany({ where: { leagueId: id, OR: [{ proposerTeamId: context.fantasyTeam.id }, { recipientTeamId: context.fantasyTeam.id }] }, orderBy: { createdAt: "desc" }, include: { proposerTeam: true, recipientTeam: true, assets: { include: { player: true } }, cuts: { include: { player: true } } }, take: 100 }),
  ]);
  const sports = context.league.sports.map(({ sport }) => sport);
  const own = teams.find(({ id: teamId }) => teamId === context.fantasyTeam!.id)!;
  const limits = Object.fromEntries(context.league.sports.map((sport) => [sport.sport, sport.rosterSlots.length + sport.benchSlots]));
  const playerData = (entry: typeof own.sportRosters[number]["entries"][number]) => ({ id: entry.playerId, name: entry.player.displayName, sport: entry.sport, positions: entry.player.gameStats[0]?.observedPositions ?? [], team: entry.player.gameStats[0]?.team.code ?? null, avg: "N/A", points: "N/A" });
  const teamData = (team: typeof own) => ({ id: team.id, name: team.name, rosters: Object.fromEntries(sports.map((sport) => [sport, team.sportRosters.find((roster) => roster.sport === sport)?.entries.map(playerData) ?? []])) });

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><p className="eyebrow">Trade center</p><h1 className="display">League trades</h1><p className="muted">Build one proposal across {sports.join(", ")}. Acceptance rechecks every sport roster and commits all assets and manager-authorized cuts in one serializable transaction.</p></div>
    <TradeBuilder leagueId={id} myTeam={teamData(own)} partners={teams.filter(({ id: teamId }) => teamId !== own.id).map(teamData)} sports={sports} limits={limits} />
    <section className="panel"><h2 className="display">Pending and trade history</h2><ul className="trade-list">{trades.map((trade) => {
      const incoming = trade.recipientTeamId === own.id;
      const offered = trade.assets.filter(({ side }) => side === "PROPOSER");
      const requested = trade.assets.filter(({ side }) => side === "RECIPIENT");
      const recipientRosters = own.sportRosters;
      const cutsBySport = Object.fromEntries(sports.map((sport) => {
        const count = recipientRosters.find((roster) => roster.sport === sport)?.entries.length ?? 0;
        const outgoing = requested.filter((asset) => asset.sport === sport).length;
        const incomingCount = offered.filter((asset) => asset.sport === sport).length;
        return [sport, Math.max(0, count - outgoing + incomingCount - limits[sport])];
      }));
      const cutsRequired = Object.values(cutsBySport).reduce((sum, count) => sum + count, 0);
      return <li key={trade.id}><div><strong>{trade.proposerTeam.name} ↔ {trade.recipientTeam.name}</strong><span className="tag">{trade.status}</span></div><div className="trade-sides"><div><strong>{trade.proposerTeam.name} sends</strong>{sports.map((sport) => { const assets = offered.filter((asset) => asset.sport === sport); return assets.length ? <div key={sport}><small>{sport}</small>{assets.map((asset) => <p key={asset.id}>{asset.player.displayName}</p>)}</div> : null; })}</div><div><strong>{trade.recipientTeam.name} sends</strong>{sports.map((sport) => { const assets = requested.filter((asset) => asset.sport === sport); return assets.length ? <div key={sport}><small>{sport}</small>{assets.map((asset) => <p key={asset.id}>{asset.player.displayName}</p>)}</div> : null; })}</div></div>
        {trade.cuts.length > 0 && <div className="trade-cuts"><strong>Associated roster cuts</strong>{sports.map((sport) => { const cuts = trade.cuts.filter((cut) => cut.sport === sport); return cuts.length ? <p key={sport}>{sport}: {cuts.map(({ player }) => player.displayName).join(", ")}</p> : null; })}</div>}
        <small>Proposed {trade.createdAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} Central{trade.respondedAt ? ` · resolved ${trade.respondedAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} Central` : ""}</small>{trade.message && <blockquote>{trade.message}</blockquote>}
        {trade.status === "PENDING" && <div className="button-row">{incoming ? <><form action={respondTradeAction.bind(null, id, trade.id, "ACCEPT")} className="form-grid">{cutsRequired > 0 && <fieldset><legend>Required roster adjustments</legend>{sports.filter((sport) => cutsBySport[sport] > 0).map((sport) => <div key={sport}><strong>Select exactly {cutsBySport[sport]} {sport} cut{cutsBySport[sport] === 1 ? "" : "s"}</strong>{(recipientRosters.find((roster) => roster.sport === sport)?.entries ?? []).filter((entry) => !requested.some(({ playerId }) => playerId === entry.playerId) && !entry.lockedAt).map((entry) => <label className="check" key={entry.id}><input type="checkbox" name="cutPlayerIds" value={entry.playerId} />{entry.player.displayName}</label>)}</div>)}</fieldset>}<button className="button primary">{cutsRequired ? "Accept with authorized cuts" : "Accept trade"}</button></form><form action={respondTradeAction.bind(null, id, trade.id, "REJECT")}><button className="button secondary">Reject</button></form></> : <form action={cancelTradeAction.bind(null, id, trade.id)}><button className="button secondary">Cancel proposal</button></form>}</div>}
      </li>;
    })}</ul>{!trades.length && <p className="muted">No trade proposals yet.</p>}</section>
  </LeagueShell>;
}
