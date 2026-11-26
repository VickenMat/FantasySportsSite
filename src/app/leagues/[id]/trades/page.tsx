import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelTradeAction, respondTradeAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { TradeBuilder } from "@/components/trade-builder";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";
import { AdvancedTradeBuilder, AdvancedTradeResponse, TradeReviewForm, type RoutedAsset } from "@/components/advanced-trade-builder";
import { hasGameplayTable } from "@/server/gameplay-storage";
import { tradeAssetsSchema } from "@/server/advanced-trades";
import { financePolicy } from "@/server/finance";

export default async function TradesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const tab = ["new","incoming","outgoing","review","history"].includes(query.tab ?? "") ? query.tab! : "new";
  const context = await leagueContext(user.id, id);
  if (!context?.fantasyTeam) notFound();
  const database = getDatabase();
  const [teams, allTrades] = await Promise.all([
    database.fantasyTeam.findMany({ where: { leagueId: id }, orderBy: { name: "asc" }, include: { sportRosters: { include: { leagueSport: true, entries: { where: { releasedAt: null }, orderBy: { player: { displayName: "asc" } }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, include: { team: true } } } } } } } } } }),
    database.trade.findMany({ where: { leagueId: id, OR: [{ proposerTeamId: context.fantasyTeam.id }, { recipientTeamId: context.fantasyTeam.id }] }, orderBy: { createdAt: "desc" }, include: { proposerTeam: true, recipientTeam: true, assets: { include: { player: true } }, cuts: { include: { player: true } } }, take: 100 }),
  ]);
  const advanced = await hasGameplayTable("TradeProposal");
  const financial = await financePolicy(database, id);
  const allProposals = advanced ? await database.tradeProposal.findMany({ where: { leagueId: id, OR: [{ participantIds: { has: context.fantasyTeam.id } }, ...(context.role === "COMMISSIONER" ? [{}] : [])] }, include: { revisions: { orderBy: { version: "desc" }, include: { acceptances: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [];
  const reviewPolicy = advanced ? await database.tradeReviewPolicy.findUnique({ where: { leagueId: id } }) : null;
  const futurePicks = advanced && context.league.format === "DYNASTY" && !financial?.salaryMode ? await database.futureDraftPick.findMany({ where: { leagueSport: { leagueId: id }, ownership: { none: { idempotencyKey: { startsWith: "future-pick-consume:" } } } }, include: { leagueSport: true, originalTeam: true } }) : [];
  const choices: RoutedAsset[] = [...teams.flatMap((team) => team.sportRosters.flatMap((roster) => roster.entries.map((entry) => ({ key: entry.id, type: "PLAYER" as const, id: entry.playerId, from: team.id, label: `${entry.sport} · ${entry.player.displayName}` })))), ...futurePicks.map((pick) => ({ key: pick.id, type: "PICK" as const, id: pick.id, from: pick.ownerTeamId, label: `${pick.leagueSport.sport} ${pick.seasonStartYear} round ${pick.round} · original ${pick.originalTeam.name}` }))];
  const proposals=allProposals.filter(p=>tab==="history"?!["PENDING","REVIEW"].includes(p.status):tab==="review"?p.status==="REVIEW":tab==="incoming"?p.status==="PENDING"&&p.proposerTeamId!==context.fantasyTeam!.id:tab==="outgoing"?p.status==="PENDING"&&p.proposerTeamId===context.fantasyTeam!.id:false);
  const trades=allTrades.filter(p=>tab==="history"?p.status!=="PENDING":tab==="incoming"?p.status==="PENDING"&&p.recipientTeamId===context.fantasyTeam!.id:tab==="outgoing"?p.status==="PENDING"&&p.proposerTeamId===context.fantasyTeam!.id:false);
  const builderProps = { leagueId: id, teams, choices, sports: context.league.sports, salaryMode: Boolean(financial?.salaryMode), faabEnabled: context.league.waiverMethod === "FAAB" && !financial?.salaryMode };
  const assetLabel = (asset: ReturnType<typeof tradeAssetsSchema.parse>[number]) => { const from = teams.find((team) => team.id === asset.from)?.name ?? "Former franchise"; const to = "to" in asset ? teams.find((team) => team.id === asset.to)?.name ?? "Former franchise" : "Release"; const description = "playerId" in asset ? choices.find((choice) => choice.id === asset.playerId)?.label ?? "Former roster player" : "pickId" in asset ? choices.find((choice) => choice.id === asset.pickId)?.label ?? "Transferred draft pick" : `${asset.amount} ${asset.type}`; return `${from} → ${to}: ${description}`; };
  const sports = context.league.sports.map(({ sport }) => sport);
  const own = teams.find(({ id: teamId }) => teamId === context.fantasyTeam!.id)!;
  const limits = Object.fromEntries(context.league.sports.map((sport) => [sport.sport, sport.rosterSlots.length + sport.benchSlots]));
  const playerData = (entry: typeof own.sportRosters[number]["entries"][number]) => ({ id: entry.playerId, name: entry.player.displayName, sport: entry.sport, positions: entry.player.gameStats[0]?.observedPositions ?? [], team: entry.player.gameStats[0]?.team.code ?? null, avg: "N/A", points: "N/A" });
  const teamData = (team: typeof own) => ({ id: team.id, name: team.name, rosters: Object.fromEntries(sports.map((sport) => [sport, team.sportRosters.find((roster) => roster.sport === sport)?.entries.map(playerData) ?? []])) });

  return <LeagueShell leagueId={id}>
    <div className="workspace-intro"><p className="eyebrow">Trade center</p><h1 className="display">League trades</h1></div>
    <nav className="sport-tabs" aria-label="Trade sections">{[["new","New Trade"],["incoming","Incoming"],["outgoing","Outgoing"],["review","Under Review"],["history","History"]].map(([key,label])=><Link key={key} href={`?tab=${key}`} aria-current={tab===key?"page":undefined} className={tab===key?"active":""}>{label}</Link>)}</nav>
    {advanced && <>{tab==="new"&&<section className="panel"><h2 className="display">New Trade</h2>{context.role === "COMMISSIONER" && <TradeReviewForm leagueId={id} hours={reviewPolicy?.reviewHours ?? 24} />}<AdvancedTradeBuilder {...builderProps} /></section>}{tab!=="new"&&<section className="panel"><h2 className="display">Proposals</h2>{proposals.map((proposal) => { const latest = proposal.revisions[0]; const terms = tradeAssetsSchema.parse(latest.assets); return <article className="compact-trade-card" key={proposal.id}><h3>{proposal.participantIds.map((teamId) => teams.find(({ id }) => id === teamId)?.name ?? "Former franchise").join(" ↔ ")}</h3><p>{proposal.status} · revision {proposal.currentRevision} · {latest.acceptances.length}/{proposal.participantIds.length} accepted · review {proposal.reviewHours}h</p><p>{proposal.executeAt ? "Review ends: "+proposal.executeAt.toISOString() : "Expires: "+proposal.expiresAt.toISOString()}</p>{proposal.reason && <p role="status">{proposal.reason}</p>}<ol>{terms.map((asset, index) => <li key={index}>{assetLabel(asset)}</li>)}</ol>{proposal.status === "PENDING" && proposal.participantIds.includes(own.id) && <AdvancedTradeResponse leagueId={id} proposalId={proposal.id} revision={proposal.currentRevision} operation="ACCEPT" />}{proposal.status === "PENDING" && proposal.proposerTeamId === own.id && <><AdvancedTradeResponse leagueId={id} proposalId={proposal.id} revision={proposal.currentRevision} operation="CANCEL" /><details><summary>Revise terms</summary><AdvancedTradeBuilder {...builderProps} proposalId={proposal.id} revision={proposal.currentRevision} initial={terms} /></details></>}{["PENDING", "REVIEW"].includes(proposal.status) && context.role === "COMMISSIONER" && <AdvancedTradeResponse leagueId={id} proposalId={proposal.id} revision={proposal.currentRevision} operation="VETO" />}<details><summary>Immutable revision history</summary>{proposal.revisions.map((row) => <div key={row.id}><p>Revision {row.version} · {row.createdAt.toISOString()} · accepted by {row.acceptances.map((acceptance) => teams.find((team) => team.id === acceptance.teamId)?.name ?? "Former franchise").join(", ") || "No managers"}</p><ul>{tradeAssetsSchema.parse(row.assets).map((asset, index) => <li key={index}>{assetLabel(asset)}</li>)}</ul></div>)}</details></article>; })}</section>}</>}
    {!advanced && tab==="new" && <TradeBuilder leagueId={id} myTeam={teamData(own)} partners={teams.filter(({ id: teamId }) => teamId !== own.id).map(teamData)} sports={sports} limits={limits} />}
    {tab!=="new"&&<section className="panel"><h2 className="display">Trades</h2><ul className="trade-list">{trades.map((trade) => {
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
    })}</ul>{!trades.length && <p className="muted">No trade proposals yet.</p>}</section>}
  </LeagueShell>;
}
