import { getDatabase } from "@/lib/db";
import { AuctionBidForm } from "./auction-actions";
import { hasGameplayTable } from "@/server/gameplay-storage";

export async function AuctionPanel({ userId, leagueId, draftId }: { userId: string; leagueId: string; draftId?: string }) {
  if (!await hasGameplayTable("LeagueFinancePolicy")) return null;
  const db = getDatabase();
  const member = await db.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true } });
  if (!member) return null;
  const auctions = await db.acquisitionAuction.findMany({ where: { leagueId, ...(draftId ? { draftId } : { draftId: null }), status: { in: ["OPEN", "SETTLED"] } }, orderBy: { opensAt: "desc" }, take: 50,
    include: { player: true, bids: { where: { OR: [{ teamId: member.fantasyTeam?.id ?? "00000000-0000-0000-0000-000000000000" }, { auction: { mode: "ENGLISH" } }, { auction: { status: "SETTLED" } }] } } } });
  return auctions.length ? <section className="panel"><h2 className="display">{draftId ? "Draft auctions" : "Salary free-agent auctions"}</h2>{auctions.map((auction) => {
    const own = auction.bids.find(({ teamId }) => teamId === member.fantasyTeam?.id);
    const publicPrice = auction.mode === "ENGLISH" ? Math.max(auction.minimum, ...auction.bids.map(({ maximum }) => maximum)) : auction.minimum;
    return <article className="mini-card" key={auction.id}><h3>{auction.player.displayName}</h3><p>{auction.mode} · {auction.status} · closes {auction.closesAt.toISOString()} UTC</p><p>{auction.status === "SETTLED" ? "Paid " + auction.price : auction.mode === "VICKREY" ? "Sealed bids · minimum " + auction.minimum : "Current price " + publicPrice}</p>
      {auction.status === "OPEN" && member.fantasyTeam && <AuctionBidForm leagueId={leagueId} auctionId={auction.id} minimum={auction.mode === "ENGLISH" ? publicPrice + 1 : auction.minimum} ownMaximum={own?.maximum} />}
    </article>;
  })}</section> : null;
}
