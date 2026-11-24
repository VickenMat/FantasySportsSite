import { z } from "zod";
import { getDatabase } from "@/lib/db";

const proposalSchema = z.object({
  leagueId: z.uuid(), recipientTeamId: z.uuid(),
  offerPlayerIds: z.array(z.uuid()).max(10), requestPlayerIds: z.array(z.uuid()).max(10),
  message: z.string().trim().max(500).optional(), expiresInHours: z.number().int().min(1).max(168).default(48),
}).refine(({ offerPlayerIds, requestPlayerIds }) => offerPlayerIds.length + requestPlayerIds.length > 0, "A trade needs at least one player.");

async function manager(userId: string, leagueId: string) {
  const membership = await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a team in this league.");
  return membership;
}

export async function proposeTrade(userId: string, input: z.input<typeof proposalSchema>) {
  const value = proposalSchema.parse(input);
  const membership = await manager(userId, value.leagueId);
  if (membership.fantasyTeam!.id === value.recipientTeamId) throw new Error("Choose another fantasy team.");
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const recipient = await tx.fantasyTeam.findFirst({ where: { id: value.recipientTeamId, leagueId: value.leagueId } });
    if (!recipient) throw new Error("The recipient team is unavailable.");
    const offered = await tx.rosterEntry.findMany({ where: { leagueId: value.leagueId, teamId: membership.fantasyTeam!.id, playerId: { in: value.offerPlayerIds } } });
    const requested = await tx.rosterEntry.findMany({ where: { leagueId: value.leagueId, teamId: recipient.id, playerId: { in: value.requestPlayerIds } } });
    if (offered.length !== new Set(value.offerPlayerIds).size || requested.length !== new Set(value.requestPlayerIds).size) {
      throw new Error("Every traded player must still belong to the stated team.");
    }
    return tx.trade.create({ data: {
      leagueId: value.leagueId, proposerTeamId: membership.fantasyTeam!.id, recipientTeamId: recipient.id,
      message: value.message || null, expiresAt: new Date(Date.now() + value.expiresInHours * 3_600_000),
      assets: { create: [
        ...offered.map(({ playerId }) => ({ teamId: membership.fantasyTeam!.id, playerId, side: "PROPOSER" as const })),
        ...requested.map(({ playerId }) => ({ teamId: recipient.id, playerId, side: "RECIPIENT" as const })),
      ] },
    }, include: { assets: true } });
  }, { isolationLevel: "Serializable" });
}

export async function respondToTrade(userId: string, tradeId: string, response: "ACCEPT" | "REJECT") {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId }, include: { assets: true, league: true, recipientTeam: true, proposerTeam: true } });
    const membership = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: trade.leagueId, userId } }, include: { fantasyTeam: true } });
    if (membership?.fantasyTeam?.id !== trade.recipientTeamId) throw new Error("Only the recipient manager can respond to this trade.");
    if (trade.status !== "PENDING") throw new Error("This trade is no longer pending.");
    const now = new Date();
    if (trade.expiresAt <= now) {
      await tx.trade.update({ where: { id: trade.id }, data: { status: "EXPIRED", respondedAt: now } });
      throw new Error("This trade has expired.");
    }
    if (response === "REJECT") return tx.trade.update({ where: { id: trade.id }, data: { status: "REJECTED", respondedAt: now } });
    const roster = await tx.rosterEntry.findMany({ where: { leagueId: trade.leagueId, playerId: { in: trade.assets.map(({ playerId }) => playerId) } } });
    const owner = new Map(roster.map((entry) => [entry.playerId, entry]));
    for (const asset of trade.assets) if (owner.get(asset.playerId)?.teamId !== asset.teamId) throw new Error("A traded player's ownership changed before acceptance.");
    const [proposerCount, recipientCount] = await Promise.all([
      tx.rosterEntry.count({ where: { teamId: trade.proposerTeamId } }), tx.rosterEntry.count({ where: { teamId: trade.recipientTeamId } }),
    ]);
    const offered = trade.assets.filter(({ side }) => side === "PROPOSER");
    const requested = trade.assets.filter(({ side }) => side === "RECIPIENT");
    const maximum = trade.league.rosterSlots.length + trade.league.benchSlots;
    if (proposerCount - offered.length + requested.length > maximum || recipientCount - requested.length + offered.length > maximum) {
      throw new Error("Acceptance would exceed a roster limit.");
    }
    for (const asset of offered) await tx.rosterEntry.update({ where: { id: owner.get(asset.playerId)!.id }, data: { teamId: trade.recipientTeamId, slot: "BENCH", lockedAt: null } });
    for (const asset of requested) await tx.rosterEntry.update({ where: { id: owner.get(asset.playerId)!.id }, data: { teamId: trade.proposerTeamId, slot: "BENCH", lockedAt: null } });
    for (const asset of trade.assets) await tx.fantasyTransaction.create({ data: {
      leagueId: trade.leagueId, teamId: asset.side === "PROPOSER" ? trade.proposerTeamId : trade.recipientTeamId,
      playerId: asset.playerId, type: "TRADE", note: `Trade ${trade.id} accepted`,
    } });
    return tx.trade.update({ where: { id: trade.id }, data: { status: "ACCEPTED", respondedAt: now, processedAt: now } });
  }, { isolationLevel: "Serializable" });
}

export async function cancelTrade(userId: string, tradeId: string) {
  const database = getDatabase();
  const trade = await database.trade.findUniqueOrThrow({ where: { id: tradeId }, include: { proposerTeam: true } });
  if (trade.proposerTeam.managerId !== userId) throw new Error("Only the proposing manager can cancel this trade.");
  if (trade.status !== "PENDING") throw new Error("This trade is no longer pending.");
  return database.trade.update({ where: { id: tradeId }, data: { status: "CANCELLED", respondedAt: new Date() } });
}
