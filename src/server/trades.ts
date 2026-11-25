import { z } from "zod";
import type { Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { sports } from "./league";
import { currentCompliance } from "./rosters";

const proposalSchema = z.object({
  leagueId: z.uuid(),
  sport: z.enum(sports).optional(),
  recipientTeamId: z.uuid(),
  offerPlayerIds: z.array(z.uuid()).max(50),
  requestPlayerIds: z.array(z.uuid()).max(50),
  proposerCutPlayerIds: z.array(z.uuid()).max(50).default([]),
  message: z.string().trim().max(500).optional(),
  expiresInHours: z.number().int().min(1).max(168).default(48),
}).refine(({ offerPlayerIds, requestPlayerIds }) => offerPlayerIds.length + requestPlayerIds.length > 0, "A trade needs at least one player.");

type Transaction = Prisma.TransactionClient;
type ActiveEntry = Awaited<ReturnType<Transaction["rosterEntry"]["findMany"]>>[number];

async function manager(userId: string, leagueId: string) {
  const membership = await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  return membership;
}

function unique(values: string[], label: string) {
  const result = [...new Set(values)];
  if (result.length !== values.length) throw new Error(`${label} cannot contain duplicate players.`);
  return result;
}

function group<T extends { sport: Sport }>(rows: T[]) {
  const result = new Map<Sport, T[]>();
  for (const row of rows) result.set(row.sport, [...(result.get(row.sport) ?? []), row]);
  return result;
}

function requiredCuts(input: {
  rosters: Map<Sport, { maximum: number; count: number }>;
  outgoing: Map<Sport, unknown[]>;
  incoming: Map<Sport, unknown[]>;
}) {
  const result = new Map<Sport, number>();
  for (const [sport, roster] of input.rosters) {
    const overflow = Math.max(0, roster.count - (input.outgoing.get(sport)?.length ?? 0) + (input.incoming.get(sport)?.length ?? 0) - roster.maximum);
    result.set(sport, overflow);
  }
  return result;
}

function validateCutCounts(cuts: ActiveEntry[], needed: Map<Sport, number>, ownerLabel: string) {
  const bySport = group(cuts);
  for (const [sport, count] of needed) if ((bySport.get(sport)?.length ?? 0) !== count) {
    throw new Error(`${ownerLabel} must authorize exactly ${count} ${sport} roster cut${count === 1 ? "" : "s"}.`);
  }
  for (const sport of bySport.keys()) if (!needed.has(sport) || needed.get(sport) === 0) throw new Error(`${ownerLabel} selected an unnecessary ${sport} roster cut.`);
}

async function teamRosterState(tx: Transaction, leagueId: string, teamId: string) {
  const rosters = await tx.fantasyRoster.findMany({ where: { leagueId, teamId }, include: { leagueSport: true } });
  const counts = await tx.rosterEntry.groupBy({ by: ["rosterId"], where: { rosterId: { in: rosters.map(({ id }) => id) }, releasedAt: null }, _count: true });
  const countByRoster = new Map(counts.map((row) => [row.rosterId, row._count]));
  return new Map(rosters.map((roster) => [roster.sport, {
    roster,
    count: countByRoster.get(roster.id) ?? 0,
    maximum: roster.leagueSport.rosterSlots.length + roster.leagueSport.benchSlots,
  }]));
}

export async function proposeTrade(userId: string, input: {
  leagueId: string; sport?: Sport | string; recipientTeamId: string; offerPlayerIds: string[]; requestPlayerIds: string[];
  proposerCutPlayerIds?: string[]; message?: string; expiresInHours?: number;
}) {
  const value = proposalSchema.parse(input);
  const membership = await manager(userId, value.leagueId);
  if (membership.fantasyTeam!.id === value.recipientTeamId) throw new Error("Choose another franchise.");
  const offerIds = unique(value.offerPlayerIds, "The offer");
  const requestIds = unique(value.requestPlayerIds, "The request");
  const cutIds = unique(value.proposerCutPlayerIds, "Your roster cuts");
  if (offerIds.some((id) => requestIds.includes(id)) || cutIds.some((id) => offerIds.includes(id) || requestIds.includes(id))) throw new Error("A player can appear only once in a trade.");
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const proposedAt = new Date();
    const proposerCompliance = await currentCompliance(tx, membership.fantasyTeam!.id, proposedAt);
    if (proposerCompliance.state !== "COMPLIANT") {
      throw new Error("Resolve roster noncompliance before initiating an ordinary outgoing trade.");
    }
    const recipient = await tx.fantasyTeam.findFirst({ where: { id: value.recipientTeamId, leagueId: value.leagueId } });
    if (!recipient) throw new Error("The recipient franchise is unavailable.");
    const allIds = [...offerIds, ...requestIds, ...cutIds];
    const entries = await tx.rosterEntry.findMany({ where: { leagueId: value.leagueId, releasedAt: null, playerId: { in: allIds } } });
    const byPlayer = new Map(entries.map((entry) => [entry.playerId, entry]));
    const offered = offerIds.map((id) => byPlayer.get(id)).filter((entry): entry is ActiveEntry => Boolean(entry));
    const requested = requestIds.map((id) => byPlayer.get(id)).filter((entry): entry is ActiveEntry => Boolean(entry));
    const cuts = cutIds.map((id) => byPlayer.get(id)).filter((entry): entry is ActiveEntry => Boolean(entry));
    if (offered.length !== offerIds.length || offered.some(({ teamId }) => teamId !== membership.fantasyTeam!.id)) throw new Error("Every offered player must remain on your franchise.");
    if (requested.length !== requestIds.length || requested.some(({ teamId }) => teamId !== recipient.id)) throw new Error("Every requested player must remain on the selected partner's franchise.");
    if (cuts.length !== cutIds.length || cuts.some(({ teamId, lockedAt }) => teamId !== membership.fantasyTeam!.id || lockedAt)) throw new Error("Every authorized cut must be an unlocked player remaining on your franchise.");
    if ([...offered, ...requested].some(({ lockedAt }) => lockedAt)) throw new Error("A player in a locked lineup cannot be traded.");
    const includedSports = new Set((await tx.leagueSport.findMany({ where: { leagueId: value.leagueId }, select: { sport: true } })).map(({ sport }) => sport));
    if ([...offered, ...requested].some(({ sport }) => !includedSports.has(sport))) throw new Error("Every asset's sport must be included in this league.");
    if (value.sport && [...offered, ...requested].some(({ sport }) => sport !== value.sport)) throw new Error(`The legacy ${value.sport} trade form cannot include another sport.`);
    const proposerState = await teamRosterState(tx, value.leagueId, membership.fantasyTeam!.id);
    const needed = requiredCuts({ rosters: new Map([...proposerState].map(([sport, state]) => [sport, { maximum: state.maximum, count: state.count }])), outgoing: group(offered), incoming: group(requested) });
    validateCutCounts(cuts, needed, "The proposing manager");
    for (const cut of cuts) if (proposerState.get(cut.sport)?.roster.id !== cut.rosterId) throw new Error("A proposed cut no longer belongs to the expected sport roster.");
    const assetSports = [...new Set([...offered, ...requested].map(({ sport }) => sport))];
    const legacySport = assetSports.length === 1 ? assetSports[0] : null;
    const legacyLeagueSport = legacySport ? proposerState.get(legacySport)?.roster.leagueSportId ?? null : null;
    return tx.trade.create({
      data: {
        leagueId: value.leagueId, leagueSportId: legacyLeagueSport, sport: legacySport,
        proposerTeamId: membership.fantasyTeam!.id, recipientTeamId: recipient.id,
        message: value.message || null, expiresAt: new Date(proposedAt.getTime() + value.expiresInHours * 3_600_000),
        assets: { create: [
          ...offered.map((entry) => ({ teamId: entry.teamId, destinationTeamId: recipient.id, sourceRosterId: entry.rosterId, playerId: entry.playerId, sport: entry.sport, side: "PROPOSER" as const })),
          ...requested.map((entry) => ({ teamId: entry.teamId, destinationTeamId: membership.fantasyTeam!.id, sourceRosterId: entry.rosterId, playerId: entry.playerId, sport: entry.sport, side: "RECIPIENT" as const })),
        ] },
        cuts: { create: cuts.map((entry) => ({ teamId: entry.teamId, rosterId: entry.rosterId, playerId: entry.playerId, sport: entry.sport })) },
      },
      include: { assets: true, cuts: true },
    });
  }, { isolationLevel: "Serializable" });
}

export async function respondToTrade(userId: string, tradeId: string, response: "ACCEPT" | "REJECT", cutPlayerIds: string[] = []) {
  const recipientCutIds = unique(cutPlayerIds, "Recipient roster cuts");
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId }, include: { assets: true, cuts: true } });
    const membership = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: trade.leagueId, userId } }, include: { fantasyTeam: true } });
    if (membership?.fantasyTeam?.id !== trade.recipientTeamId) throw new Error("Only the recipient manager can respond to this trade.");
    if (trade.status !== "PENDING") throw new Error("This trade is no longer pending.");
    const now = new Date();
    if (trade.expiresAt <= now) { await tx.trade.update({ where: { id: trade.id }, data: { status: "EXPIRED", respondedAt: now } }); throw new Error("This trade has expired."); }
    if (response === "REJECT") return tx.trade.update({ where: { id: trade.id }, data: { status: "REJECTED", respondedAt: now } });
    const assetEntries = await tx.rosterEntry.findMany({ where: { leagueId: trade.leagueId, releasedAt: null, playerId: { in: trade.assets.map(({ playerId }) => playerId) } } });
    const owner = new Map(assetEntries.map((entry) => [entry.playerId, entry]));
    for (const asset of trade.assets) {
      const entry = owner.get(asset.playerId);
      if (!entry || entry.teamId !== asset.teamId || entry.rosterId !== asset.sourceRosterId || entry.sport !== asset.sport) throw new Error("A traded player's ownership changed before acceptance.");
      if (entry.lockedAt) throw new Error("A traded player entered a locked lineup before acceptance.");
    }
    const [proposerState, recipientState] = await Promise.all([
      teamRosterState(tx, trade.leagueId, trade.proposerTeamId),
      teamRosterState(tx, trade.leagueId, trade.recipientTeamId),
    ]);
    const offered = trade.assets.filter(({ side }) => side === "PROPOSER");
    const requested = trade.assets.filter(({ side }) => side === "RECIPIENT");
    const proposerNeeded = requiredCuts({ rosters: new Map([...proposerState].map(([sport, state]) => [sport, { maximum: state.maximum, count: state.count }])), outgoing: group(offered), incoming: group(requested) });
    const proposerCuts = await tx.rosterEntry.findMany({ where: { leagueId: trade.leagueId, releasedAt: null, playerId: { in: trade.cuts.filter(({ teamId }) => teamId === trade.proposerTeamId).map(({ playerId }) => playerId) } } });
    if (proposerCuts.some(({ teamId, lockedAt }) => teamId !== trade.proposerTeamId || lockedAt)) throw new Error("A proposing manager's authorized roster cut is no longer valid.");
    validateCutCounts(proposerCuts, proposerNeeded, "The proposing manager");
    const recipientNeeded = requiredCuts({ rosters: new Map([...recipientState].map(([sport, state]) => [sport, { maximum: state.maximum, count: state.count }])), outgoing: group(requested), incoming: group(offered) });
    const recipientCuts = recipientCutIds.length ? await tx.rosterEntry.findMany({ where: { leagueId: trade.leagueId, teamId: trade.recipientTeamId, releasedAt: null, lockedAt: null, playerId: { in: recipientCutIds } } }) : [];
    if (recipientCuts.length !== recipientCutIds.length || recipientCuts.some(({ playerId }) => requested.some((asset) => asset.playerId === playerId))) throw new Error("Every recipient cut must be an unlocked player remaining after the trade.");
    validateCutCounts(recipientCuts, recipientNeeded, "The accepting manager");
    if (recipientCuts.length) await tx.tradeCut.createMany({ data: recipientCuts.map((entry) => ({ tradeId: trade.id, teamId: entry.teamId, rosterId: entry.rosterId, playerId: entry.playerId, sport: entry.sport })) });
    const allCuts = [...proposerCuts, ...recipientCuts];
    for (const cut of allCuts) {
      await tx.rosterEntry.update({ where: { id: cut.id }, data: { releasedAt: now } });
      await tx.rosterAssignmentEvent.create({ data: { leagueId: trade.leagueId, teamId: cut.teamId, rosterEntryId: cut.id,
        fromSlot: cut.slot, fromSlotIndex: cut.slotIndex, toSlot: "RELEASED", toSlotIndex: 1, effectiveAt: now,
        reason: "Manager-authorized trade cut", idempotencyKey: `trade-cut:${trade.id}:${cut.id}` } });
      const state = (cut.teamId === trade.proposerTeamId ? proposerState : recipientState).get(cut.sport)!;
      await tx.fantasyTransaction.create({ data: { leagueId: trade.leagueId, leagueSportId: state.roster.leagueSportId, rosterId: state.roster.id, sport: cut.sport, teamId: cut.teamId, playerId: cut.playerId, type: "DROP", note: `Manager-authorized cut for trade ${trade.id}` } });
    }
    for (const asset of trade.assets) {
      const destinationState = (asset.destinationTeamId === trade.proposerTeamId ? proposerState : recipientState).get(asset.sport);
      if (!destinationState) throw new Error(`The destination franchise has no ${asset.sport} roster.`);
      const bench = await tx.rosterEntry.findMany({ where: { rosterId: destinationState.roster.id, releasedAt: null, slot: "BENCH" }, select: { slotIndex: true } });
      const used = new Set(bench.map(({ slotIndex }) => slotIndex)); let slotIndex = 1;
      const benchLimit = destinationState.roster.leagueSport.benchSlots;
      while (used.has(slotIndex) && slotIndex <= benchLimit) slotIndex++;
      if (slotIndex > benchLimit) throw new Error(`The destination ${asset.sport} bench has no open position.`);
      const prior = owner.get(asset.playerId)!;
      await tx.rosterEntry.update({ where: { id: prior.id }, data: { teamId: asset.destinationTeamId, rosterId: destinationState.roster.id, slot: "BENCH", slotIndex, lockedAt: null } });
      await tx.rosterAssignmentEvent.create({ data: { leagueId: trade.leagueId, teamId: asset.destinationTeamId, rosterEntryId: prior.id,
        fromSlot: prior.slot, fromSlotIndex: prior.slotIndex, toSlot: "BENCH", toSlotIndex: slotIndex, effectiveAt: now,
        reason: "Accepted trade", idempotencyKey: `trade-move:${trade.id}:${prior.id}` } });
      await tx.fantasyTransaction.create({ data: { leagueId: trade.leagueId, leagueSportId: destinationState.roster.leagueSportId, rosterId: destinationState.roster.id, sport: asset.sport, teamId: asset.destinationTeamId, playerId: asset.playerId, type: "TRADE", note: `Trade ${trade.id} accepted` } });
    }
    const proposerCompliance = await currentCompliance(tx, trade.proposerTeamId, now);
    const recipientCompliance = await currentCompliance(tx, trade.recipientTeamId, now);
    if (proposerCompliance.state !== "COMPLIANT" || recipientCompliance.state !== "COMPLIANT") {
      throw new Error("A trade must leave every participating franchise roster compliant.");
    }
    await tx.tradeCut.updateMany({ where: { tradeId: trade.id }, data: { processedAt: now } });
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
