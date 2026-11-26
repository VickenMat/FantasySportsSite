import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelWaiverAction, processWaiversAction, waiverAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { LeagueSportTabs } from "@/components/league-sport-tabs";
import { PositionBadges } from "@/components/position-badge";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { browsePlayers } from "@/server/player-browser";
import { leagueContext, resolveLeagueSport } from "@/server/league";
import { displayTenths } from "@/server/player-statistics";
import { waiverFunds } from "@/server/faab";
import { waiverHoldUntil } from "@/server/waiver-holds";
import { financePolicy } from "@/server/finance";
import { AuctionPanel } from "@/components/auction-panel";
import { NominateAuctionForm } from "@/components/auction-actions";

export default async function WaiversPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string; q?: string; position?: string; page?: string; sort?: string; availability?: string; points?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams;
  const context = await leagueContext(user.id, id); if (!context) notFound(); const selected = await resolveLeagueSport(id, query.sport);
  const roster = context.fantasyTeam?.sportRosters.find(({ sport }) => sport === selected.sport); const db = getDatabase();
  const financial = await financePolicy(db, id);
  const replay = context.league.isHistorical ? await db.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId: id, sport: selected.sport, number: Math.max(1, context.league.currentPeriod) } } }) : null;
  const availability = ["ALL", "FREE_AGENTS", "WAIVERS", "ROSTERED"].includes(query.availability ?? "") ? query.availability as "ALL" | "FREE_AGENTS" | "WAIVERS" | "ROSTERED" : "ALL";
  const pool = await browsePlayers(id, { sport: selected.sport, search: query.q, position: query.position || undefined, page: Number(query.page ?? 1), pageSize: 50, availability, presetId: context.league.presetId, seasonId: selected.seasonId, asOf: replay?.endsAt, sort: query.sort, points: query.points });
  const ids = pool.items.map(({ id }) => id);
  const [claims, transactions, ownership, funds] = await Promise.all([
    roster ? db.waiverClaim.findMany({ where: { rosterId: roster.id }, include: { addPlayer: true, dropPlayer: true }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
    db.fantasyTransaction.findMany({ where: { leagueId: id, sport: selected.sport }, include: { player: true, team: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.rosterEntry.findMany({ where: { leagueId: id, playerId: { in: ids }, releasedAt: null }, include: { team: { select: { name: true } } } }),
    roster ? waiverFunds(db, id, selected.id, context.fantasyTeam!.id) : { scope: context.league.faabScope, balance: 0, reserved: 0 },
  ]);
  const owners = new Map(ownership.map((entry) => [entry.playerId, entry.team.name]));
  const now = new Date();
  const holds = new Map(await Promise.all(ids.filter((id) => !owners.has(id)).map(async (playerId) => [playerId, await waiverHoldUntil(db, id, playerId, now)] as const)));
  const reserved = funds.reserved;
  const spendable = Math.max(0, funds.balance - reserved);
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><h1 className="display">{selected.sport} waiver wire</h1><p>All canonical players can be browsed here. Only unrostered players can be acquired, subject to roster, budget, eligibility and lifecycle validation.</p><LeagueSportTabs leagueId={id} path="/waivers" sports={context.league.sports.map(({ sport }) => sport)} selected={selected.sport} /></div>
    {financial?.salaryMode && <><p><Link href={"/leagues/" + id + "/finances"}>My salary cap, reservations and dead cap</Link></p><AuctionPanel userId={user.id} leagueId={id} /></>}
    <section className="panel"><h2 className="display">Player browser</h2><p>Historical actuals for {selected.seasonLabel}{replay ? " through " + replay.endsAt.toISOString() : ""}. Unknown inputs remain N/A; projections are unavailable.</p>
      <form method="get" className="filter-bar"><input type="hidden" name="sport" value={selected.sport} />
        <label>Search<input name="q" defaultValue={query.q} /></label><label>Position<input name="position" placeholder="ALL" defaultValue={query.position} /></label>
        <label>Acquisition status<select name="availability" defaultValue={availability}><option value="ALL">All players</option><option value="FREE_AGENTS">Free agents</option><option value="WAIVERS">On waivers</option><option value="ROSTERED">Rostered players</option></select></label>
        <label>Fantasy points<select name="points" defaultValue={query.points ?? "ALL"}><option value="ALL">All, including unknown</option><option value="KNOWN">Complete historical points</option><option value="UNKNOWN">Unknown or incomplete points</option></select></label>
        <label>Sort<select name="sort" defaultValue={query.sort ?? "NAME"}><option value="NAME">Name</option><option value="AVG">AVG</option><option value="PTS">PTS</option></select></label><button className="button secondary">Filter</button>
      </form>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>POS</th><th>TEAM</th><th>Fantasy owner</th><th>GP</th><th>AVG</th><th>PTS</th><th>PROJ</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{pool.items.map((player) => {
        const statistics = pool.statistics.get(player.id); const owner = owners.get(player.id); const hold = holds.get(player.id);
        return <tr key={player.id}><td>{player.displayName}</td><td><PositionBadges sport={selected.sport} positions={player.positions} /></td><td>{player.gameStats[0]?.team.code ?? "N/A"}</td><td>{owner ?? "Unrostered"}</td><td>{statistics?.gamesPlayed ?? "N/A"}</td><td>{displayTenths(statistics?.averageTenths)}</td><td>{displayTenths(statistics?.totalTenths)}</td><td>N/A</td>
        <td>{owner ? "Rostered" : hold && hold > now ? "On waivers until " + hold.toISOString() : "Free agent · eligibility checks apply"}</td>
        <td>{roster && !owner && (financial?.salaryMode ? <NominateAuctionForm leagueId={id} leagueSportId={selected.id} playerId={player.id} /> : <form action={waiverAction.bind(null, id)} className="inline-form"><input type="hidden" name="sport" value={selected.sport} /><input type="hidden" name="addPlayerId" value={player.id} /><input name="bid" type="number" min="0" max={spendable} defaultValue="0" aria-label={"FAAB bid for " + player.displayName} /><button className="button primary">Claim</button></form>)}</td></tr>;
      })}</tbody></table></div><p>{pool.total} matching players · page {pool.page} of {pool.pages}</p>
      <nav className="pagination" aria-label="Player pages">{pool.page > 1 && <Link href={{ query: { ...query, sport: selected.sport, page: pool.page - 1 } }}>Previous</Link>}{pool.page < pool.pages && <Link href={{ query: { ...query, sport: selected.sport, page: pool.page + 1 } }}>Next</Link>}</nav>
    </section>
    <div className="league-details">{!financial?.salaryMode && <section className="panel"><h2 className="display">My claims</h2><p>{spendable} FAAB available to bid{reserved > 0 ? " · " + reserved + " reserved" : ""}. Claims are private to your franchise.</p>
      <ul className="transaction-list">{claims.map((claim) => <li key={claim.id}><strong>{claim.addPlayer.displayName}</strong><span>{claim.bid} FAAB · {claim.status} · {claim.status === "PENDING" && claim.reason?.startsWith("Awaiting verified game completion") ? "awaiting game completion" : `processing ${claim.processAt.toISOString()} UTC`}</span>{claim.dropPlayer && <small>Drop {claim.dropPlayer.displayName}</small>}{claim.reason && <small>{claim.reason}</small>}{claim.status === "PENDING" && <form action={cancelWaiverAction.bind(null, id, claim.id)}><button className="button secondary">Cancel claim</button></form>}</li>)}</ul>
      {context.role === "COMMISSIONER" && <form action={processWaiversAction.bind(null, id)}><input type="hidden" name="sport" value={selected.sport} /><button className="button secondary">Process due claims</button></form>}
    </section>}<section className="panel"><h2 className="display">League transactions</h2><ul className="transaction-list">{transactions.map((transaction) => <li key={transaction.id}><strong>{transaction.type === "DROP" ? "CUT" : transaction.type}: {transaction.player?.displayName ?? "Roster transaction"}</strong><span>{transaction.team.name} · {transaction.sport} · {transaction.createdAt.toISOString()} UTC</span><small>{transaction.note}</small></li>)}</ul></section></div>
  </LeagueShell>;
}
