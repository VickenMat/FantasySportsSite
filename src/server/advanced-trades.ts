import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { accountForWaiver } from "./faab";
import { accountForAcquisition, bookFinance, financePolicy, releaseSalary, salaryCompliance, transferCurrentCap } from "./finance";
import { currentCompliance } from "./rosters";
import { consumptionKey, type RookieSnapshot } from "./dynasty-picks";
import { openAcquisitionSlot } from "@/rosters/acquisition-slot";
import { getEligiblePositions } from "./positions";
import { hasGameplayTable } from "./gameplay-storage";
import { runBackgroundJob } from "./background-jobs";

type Tx = Prisma.TransactionClient;
const route = { from: z.uuid(), to: z.uuid() };
export const tradeAssetsSchema = z.array(z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAYER"), ...route, playerId: z.uuid() }).strict(),
  z.object({ type: z.literal("PICK"), ...route, pickId: z.uuid() }).strict(),
  z.object({ type: z.literal("FAAB"), ...route, leagueSportId: z.uuid(), amount: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("CAP"), ...route, leagueSportId: z.uuid(), amount: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("CUT"), from: z.uuid(), playerId: z.uuid() }).strict(),
])).min(1).max(200);
export type TradeAssets = z.infer<typeof tradeAssetsSchema>;

async function commissioner(tx: Tx, leagueId: string, userId: string) {
  const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can administer trading policy or veto a proposal.");
}
async function audit(tx: Tx, leagueId: string, userId: string, id: string, action: string, after: Prisma.InputJsonValue, reason: string) {
  await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action, targetType: "TradeProposal", targetId: id, before: {}, after, reason } });
}
export async function configureTradeReview(userId: string, leagueId: string, hours: number) {
  z.number().int().min(0).max(168).parse(hours);
  return getDatabase().$transaction(async (tx) => {
    await commissioner(tx, leagueId, userId);
    const policy = await tx.tradeReviewPolicy.upsert({ where: { leagueId }, create: { leagueId, reviewHours: hours }, update: { reviewHours: hours } });
    await audit(tx, leagueId, userId, leagueId, "CONFIGURE_TRADE_REVIEW", policy, "Review policy applies to future proposals; existing proposals retain their review period.");
    return policy;
  }, { isolationLevel: "Serializable" });
}

/** Check every routed asset independently; a universal cap transfer carries no player deadline. */
async function validateAssets(tx: Tx, leagueId: string, participants: string[], assets: TradeAssets, at: Date) {
  const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId } });
  const teams = await tx.fantasyTeam.findMany({ where: { leagueId, id: { in: participants } } });
  if (participants.length < 2 || teams.length !== participants.length || new Set(participants).size !== participants.length) throw new Error("Include at least two distinct franchises from this league.");
  const seen = new Set<string>();
  let deadline = Infinity;
  const policy = await financePolicy(tx, leagueId);
  for (const asset of assets) {
    if (!participants.includes(asset.from) || ("to" in asset && (!participants.includes(asset.to) || asset.from === asset.to))) throw new Error("Every asset must move between distinct participating franchises.");
    const identity = asset.type === "PLAYER" || asset.type === "CUT" ? `player:${asset.playerId}` : asset.type === "PICK" ? `pick:${asset.pickId}` : `${asset.type}:${asset.from}:${asset.to}:${asset.leagueSportId}`;
    if (seen.has(identity)) throw new Error("An asset may appear only once in a proposal revision.");
    seen.add(identity);
    if (asset.type === "PICK") {
      if (league.format !== "DYNASTY" || policy?.salaryMode) throw new Error("Future picks require traditional dynasty.");
      const pick = await tx.futureDraftPick.findFirstOrThrow({ where: { id: asset.pickId, leagueSport: { leagueId } } });
      if (pick.ownerTeamId !== asset.from || await tx.futureDraftPickOwnership.findUnique({ where: { idempotencyKey: consumptionKey(pick.id) } })) throw new Error("Pick ownership changed or the selection was consumed.");
      const draft = await tx.draft.findFirst({ where: { leagueSportId: pick.leagueSportId, kind: "ROOKIE", season: { startYear: pick.seasonStartYear } } });
      if (draft) {
        const snapshot = JSON.parse(draft.orderProvenance ?? "null") as RookieSnapshot | null;
        const index = snapshot?.slots.findIndex((slot) => slot.futurePickId === pick.id) ?? -1;
        if (index < 0 || index < draft.currentPick - 1 || draft.status === "COMPLETE") throw new Error("The rookie selection is no longer transferable.");
      }
      continue;
    }
    let sportId: string;
    if (asset.type === "PLAYER" || asset.type === "CUT") {
      const entry = await tx.rosterEntry.findFirst({ where: { leagueId, playerId: asset.playerId, releasedAt: null } });
      if (!entry || entry.teamId !== asset.from) throw new Error("Player ownership changed before execution.");
      if (entry.lockedAt) throw new Error("A locked player cannot be transferred or cut.");
      const roster = await tx.fantasyRoster.findUniqueOrThrow({ where: { id: entry.rosterId } });
      sportId = roster.leagueSportId;
    } else sportId = asset.leagueSportId;
    const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: sportId, leagueId } });
    const assignment = await tx.leagueSportSeason.findUniqueOrThrow({ where: { leagueSportId_seasonId: { leagueSportId: sport.id, seasonId: sport.seasonId } } });
    if (asset.type === "CAP" && policy?.scope === "UNIVERSAL") {
      const cycle = await tx.championshipCycle.findUniqueOrThrow({ where: { id: assignment.championshipCycleId } });
      if (cycle.status === "COMPLETE") throw new Error("The universal cap cycle has ended.");
    } else {
      const offseason = assignment.rolloverEligibleAt != null && at >= assignment.rolloverEligibleAt;
      if (offseason && league.format === "REDRAFT") throw new Error("Redraft offseason trades are prohibited.");
      if (asset.type !== "CUT" && !(offseason && league.format === "DYNASTY" && asset.type === "PLAYER")) {
        if (!assignment.tradeDeadlineAt) throw new Error("PENDING_DATA: an asset's authoritative sport trade deadline is unavailable.");
        if (assignment.tradeDeadlineAt <= at) throw new Error("An asset's sport trade deadline has passed.");
        deadline = Math.min(deadline, +assignment.tradeDeadlineAt);
      }
    }
    if (asset.type === "CAP" && !policy?.salaryMode) throw new Error("Salary cap assets require salary dynasty.");
    if (asset.type === "FAAB" && (policy?.salaryMode || league.waiverMethod !== "FAAB")) throw new Error("FAAB transfers require traditional FAAB waivers.");
  }
  return deadline;
}

export async function proposeAdvancedTrade(userId: string, input: { leagueId: string; participants: string[]; assets: TradeAssets; expiresAt: Date; proposalId?: string; expectedRevision?: number }, at = new Date()) {
  const assets = tradeAssetsSchema.parse(input.assets);
  if (input.expiresAt <= at || +input.expiresAt > +at + 168 * 3600000) throw new Error("Offer expiry must be within the next seven days.");
  return getDatabase().$transaction(async (tx) => {
    const team = await tx.fantasyTeam.findFirstOrThrow({ where: { leagueId: input.leagueId, managerId: userId } });
    if (!input.participants.includes(team.id)) throw new Error("The proposing manager must participate.");
    const compliance = await currentCompliance(tx, team.id, at);
    if (compliance.state !== "COMPLIANT") throw new Error("Restore compliance through releases or incoming cap before initiating an outgoing proposal.");
    const deadline = await validateAssets(tx, input.leagueId, input.participants, assets, at);
    const policy = await tx.tradeReviewPolicy.findUnique({ where: { leagueId: input.leagueId } });
    const previous = input.proposalId ? await tx.tradeProposal.findFirstOrThrow({ where: { id: input.proposalId, leagueId: input.leagueId } }) : null;
    if (previous && (previous.proposerTeamId !== team.id || previous.status !== "PENDING" || previous.currentRevision !== input.expectedRevision)) throw new Error("Only the proposer may revise an unchanged pending offer.");
    const reviewHours = previous?.reviewHours ?? policy?.reviewHours ?? 24;
    if (+at + reviewHours * 3600000 >= deadline) throw new Error("The review window would cross an asset's deadline.");
    const version = (previous?.currentRevision ?? 0) + 1;
    const data = { participantIds: input.participants, currentRevision: version, expiresAt: new Date(Math.min(+input.expiresAt, deadline)) };
    const proposal = previous ? await tx.tradeProposal.update({ where: { id: previous.id }, data }) : await tx.tradeProposal.create({ data: { ...data, leagueId: input.leagueId, proposerTeamId: team.id, reviewHours } });
    await tx.tradeProposalRevision.create({ data: { proposalId: proposal.id, version, assets, actorUserId: userId, createdAt: at } });
    await audit(tx, input.leagueId, userId, proposal.id, previous ? "REVISE_TRADE" : "PROPOSE_TRADE", { version, participants: input.participants, assets }, "All participants must explicitly accept this exact immutable revision.");
    return proposal;
  }, { isolationLevel: "Serializable" });
}

async function changeFaab(tx: Tx, id: string, key: string, balance: number, reserved: number) {
  if (await tx.faabLedgerEntry.findUnique({ where: { idempotencyKey: key } })) return;
  const account = await tx.faabAccount.findUniqueOrThrow({ where: { id } });
  const next = { balance: account.balance + balance, reserved: account.reserved + reserved };
  if (next.reserved < 0 || next.balance < next.reserved) throw new Error("Insufficient unreserved FAAB for the proposal.");
  await tx.faabAccount.update({ where: { id }, data: next });
  await tx.faabLedgerEntry.create({ data: { accountId: id, type: "TRADE", balanceDelta: balance, reservedDelta: reserved, balanceAfter: next.balance, reservedAfter: next.reserved, reason: "Revisioned trade settlement/reservation", idempotencyKey: key } });
}
async function reservations(tx: Tx, proposalId: string, version: number, assets: TradeAssets, leagueId: string, release: boolean) {
  for (const [index, asset] of assets.entries()) {
    if (asset.type !== "CAP" && asset.type !== "FAAB") continue;
    const key = `trade:${proposalId}:${version}:${index}:${release ? "release" : "reserve"}`;
    const amount = asset.amount * (release ? -1 : 1);
    if (asset.type === "CAP") {
      const account = await accountForAcquisition(tx, asset.leagueSportId, asset.from);
      await bookFinance(tx, account.id, key, "TRADE_RESERVATION", { reserved: amount }, { proposalId, version, index }, !release);
    } else {
      const account = await accountForWaiver(tx, leagueId, asset.leagueSportId, asset.from);
      await changeFaab(tx, account.id, key, 0, amount);
    }
  }
}
export async function acceptAdvancedTrade(userId: string, proposalId: string, version: number, at = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const proposal = await tx.tradeProposal.findUniqueOrThrow({ where: { id: proposalId } });
    if (proposal.status !== "PENDING" || proposal.currentRevision !== version || proposal.expiresAt <= at) throw new Error("This proposal revision is no longer pending.");
    const team = await tx.fantasyTeam.findFirstOrThrow({ where: { leagueId: proposal.leagueId, managerId: userId, id: { in: proposal.participantIds } } });
    const revision = await tx.tradeProposalRevision.findUniqueOrThrow({ where: { proposalId_version: { proposalId, version } } });
    const assets = tradeAssetsSchema.parse(revision.assets);
    const deadline = await validateAssets(tx, proposal.leagueId, proposal.participantIds, assets, at);
    await tx.tradeProposalAcceptance.upsert({ where: { revisionId_teamId: { revisionId: revision.id, teamId: team.id } }, create: { revisionId: revision.id, teamId: team.id, actorUserId: userId, acceptedAt: at }, update: {} });
    const accepted = await tx.tradeProposalAcceptance.count({ where: { revisionId: revision.id, teamId: { in: proposal.participantIds } } });
    if (accepted !== proposal.participantIds.length) return proposal;
    const executeAt = new Date(+at + proposal.reviewHours * 3600000);
    if (+executeAt >= deadline || executeAt >= proposal.expiresAt) throw new Error("The full review period would cross the offer or asset deadline.");
    await reservations(tx, proposalId, version, assets, proposal.leagueId, false);
    return tx.tradeProposal.update({ where: { id: proposalId }, data: { status: "REVIEW", executeAt } });
  }, { isolationLevel: "Serializable" });
}
export async function closeAdvancedTrade(userId: string, proposalId: string, action: "CANCEL" | "VETO", reason: string, at = new Date()) {
  z.string().trim().min(5).max(1000).parse(reason);
  return getDatabase().$transaction(async (tx) => {
    const proposal = await tx.tradeProposal.findUniqueOrThrow({ where: { id: proposalId }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
    if (action === "VETO") await commissioner(tx, proposal.leagueId, userId);
    else if (!await tx.fantasyTeam.findFirst({ where: { id: proposal.proposerTeamId, managerId: userId } }) || proposal.status !== "PENDING") throw new Error("Only the proposer can cancel before final acceptance.");
    if (!["PENDING", "REVIEW"].includes(proposal.status)) throw new Error("This proposal is already closed.");
    if (proposal.status === "REVIEW") await reservations(tx, proposal.id, proposal.currentRevision, tradeAssetsSchema.parse(proposal.revisions[0].assets), proposal.leagueId, true);
    await audit(tx, proposal.leagueId, userId, proposalId, action === "VETO" ? "VETO_TRADE" : "CANCEL_TRADE", { reason }, reason);
    return tx.tradeProposal.update({ where: { id: proposalId }, data: { status: action === "VETO" ? "VETOED" : "CANCELLED", processedAt: at, reason } });
  }, { isolationLevel: "Serializable" });
}

export async function executeAdvancedTrade(proposalId: string, at = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const proposal = await tx.tradeProposal.findUniqueOrThrow({ where: { id: proposalId } });
    if (proposal.status === "EXECUTED") return proposal;
    if (proposal.status !== "REVIEW" || !proposal.executeAt || proposal.executeAt > at || proposal.expiresAt <= at) throw new Error("Trade execution is not due or the offer expired.");
    const revision = await tx.tradeProposalRevision.findUniqueOrThrow({ where: { proposalId_version: { proposalId, version: proposal.currentRevision } } });
    const assets = tradeAssetsSchema.parse(revision.assets);
    await validateAssets(tx, proposal.leagueId, proposal.participantIds, assets, at);
    for (const teamId of [...proposal.participantIds].sort()) {
      if (!(await salaryCompliance(tx, teamId)).compliant && assets.some((asset) => asset.type === "PLAYER" && asset.from === teamId)) throw new Error("An over-cap franchise must cut players; outgoing trades cannot bypass required releases.");
    }
    await reservations(tx, proposalId, proposal.currentRevision, assets, proposal.leagueId, true);
    // Remove all outgoing slots first so balanced exchanges cannot collide with each other's occupied slots.
    const outgoing = await tx.rosterEntry.findMany({ where: { leagueId: proposal.leagueId, releasedAt: null, playerId: { in: assets.flatMap((asset) => asset.type === "PLAYER" || asset.type === "CUT" ? [asset.playerId] : []) } } });
    for (const entry of outgoing) {
      const asset = assets.find((asset) => (asset.type === "PLAYER" || asset.type === "CUT") && asset.playerId === entry.playerId)!;
      if (asset.type === "CUT") await releaseSalary(tx, proposal.leagueId, entry.playerId, entry.teamId, at);
      await tx.rosterEntry.update({ where: { id: entry.id }, data: { releasedAt: at } });
      await tx.rosterAssignmentEvent.create({ data: { leagueId: proposal.leagueId, teamId: entry.teamId, rosterEntryId: entry.id, fromSlot: entry.slot, fromSlotIndex: entry.slotIndex, toSlot: "RELEASED", toSlotIndex: 1, effectiveAt: at, reason: asset.type === "CUT" ? "Accepted proposal authorized cut" : "Accepted proposal ownership transfer", idempotencyKey: `advanced-out:${proposalId}:${entry.id}` } });
      if (asset.type === "CUT") await tx.fantasyTransaction.create({ data: { leagueId: proposal.leagueId, leagueSportId: (await tx.fantasyRoster.findUniqueOrThrow({ where: { id: entry.rosterId } })).leagueSportId, teamId: entry.teamId, playerId: entry.playerId, sport: entry.sport, rosterId: entry.rosterId, type: "DROP", note: `Authorized trade cut ${proposalId}` } });
    }
    const salaryMoves: { salaryId: string; to: string; accountId: string }[] = [];
    const payrollDeltas = new Map<string, number>();
    for (const [index, asset] of assets.entries()) {
      const key = `trade:${proposalId}:${proposal.currentRevision}:${index}`;
      if (asset.type === "PLAYER") {
        const prior = outgoing.find(({ playerId }) => playerId === asset.playerId)!;
        const roster = await tx.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: asset.to, leagueSportId: (await tx.fantasyRoster.findUniqueOrThrow({ where: { id: prior.rosterId } })).leagueSportId } }, include: { leagueSport: { include: { season: true, league: true } } } });
        const sport = roster.leagueSport;
        const eligibility = await getEligiblePositions({ playerId: asset.playerId, sport: prior.sport, seasonYear: sport.season.startYear, asOf: at }, tx);
        const placement = openAcquisitionSlot({ sport: prior.sport, rosterId: roster.id, starters: sport.rosterSlots, bench: sport.benchSlots, universalBench: sport.league.universalBenchSlots, positions: new Set(eligibility.positions), entries: await tx.rosterEntry.findMany({ where: { teamId: asset.to, releasedAt: null } }) });
        if (!placement) throw new Error("Explicit authorized cuts are required to provide legal roster capacity.");
        const entry = await tx.rosterEntry.create({ data: { leagueId: proposal.leagueId, teamId: asset.to, rosterId: roster.id, playerId: prior.playerId, sport: prior.sport, seasonId: sport.seasonId, ...placement, acquiredAt: at } });
        await tx.rosterAssignmentEvent.create({ data: { leagueId: proposal.leagueId, teamId: asset.to, rosterEntryId: entry.id, toSlot: entry.slot, toSlotIndex: entry.slotIndex, effectiveAt: at, reason: "Executed immutable trade revision", idempotencyKey: `${key}:ownership` } });
        await tx.fantasyTransaction.create({ data: { leagueId: proposal.leagueId, leagueSportId: sport.id, rosterId: roster.id, teamId: asset.to, playerId: prior.playerId, sport: prior.sport, type: "TRADE", note: `Trade ${proposalId} revision ${proposal.currentRevision}; previous entry ${prior.id}` } });
        if ((await financePolicy(tx, proposal.leagueId))?.salaryMode) {
          const salary = await tx.playerSalary.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId: proposal.leagueId, playerId: asset.playerId } } });
          if (!salary.active || salary.teamId !== asset.from) throw new Error("The player salary no longer matches ownership.");
          const target = await accountForAcquisition(tx, sport.id, asset.to);
          payrollDeltas.set(salary.accountId, (payrollDeltas.get(salary.accountId) ?? 0) - salary.amount);
          payrollDeltas.set(target.id, (payrollDeltas.get(target.id) ?? 0) + salary.amount);
          salaryMoves.push({ salaryId: salary.id, to: asset.to, accountId: target.id });
        }
      } else if (asset.type === "PICK") {
        const pick = await tx.futureDraftPick.update({ where: { id: asset.pickId }, data: { ownerTeamId: asset.to } });
        await tx.futureDraftPickOwnership.create({ data: { pickId: pick.id, ownerTeamId: asset.to, reason: `Negotiated trade ${proposalId} revision ${proposal.currentRevision}`, idempotencyKey: `${key}:pick` } });
        const draft = await tx.draft.findFirst({ where: { leagueSportId: pick.leagueSportId, kind: "ROOKIE", season: { startYear: pick.seasonStartYear } } });
        if (draft) {
          const snapshot = JSON.parse(draft.orderProvenance!) as RookieSnapshot;
          const order = [...draft.pickOrder]; order[snapshot.slots.findIndex((slot) => slot.futurePickId === pick.id)] = asset.to;
          await tx.draft.update({ where: { id: draft.id }, data: { pickOrder: order, version: { increment: 1 } } });
        }
      } else if (asset.type === "FAAB") {
        const from = await accountForWaiver(tx, proposal.leagueId, asset.leagueSportId, asset.from);
        const to = await accountForWaiver(tx, proposal.leagueId, asset.leagueSportId, asset.to);
        await changeFaab(tx, from.id, `${key}:out`, -asset.amount, 0); await changeFaab(tx, to.id, `${key}:in`, asset.amount, 0);
      } else if (asset.type === "CAP") {
        const from = await accountForAcquisition(tx, asset.leagueSportId, asset.from); const to = await accountForAcquisition(tx, asset.leagueSportId, asset.to);
        await transferCurrentCap(tx, from.id, to.id, asset.amount, key, at);
      }
    }
    for (const [accountId, payroll] of [...payrollDeltas].sort(([a], [b]) => a.localeCompare(b))) await bookFinance(tx, accountId, `trade:${proposalId}:payroll:${accountId}`, "SALARY_TRANSFER", { payroll }, { proposalId, revision: proposal.currentRevision }, false);
    for (const move of salaryMoves) await tx.playerSalary.update({ where: { id: move.salaryId }, data: { teamId: move.to, accountId: move.accountId, version: { increment: 1 } } });
    for (const teamId of proposal.participantIds) if ((await currentCompliance(tx, teamId, at)).state !== "COMPLIANT") throw new Error("Every participating franchise must be compliant after settlement.");
    await audit(tx, proposal.leagueId, revision.actorUserId, proposalId, "EXECUTE_TRADE", { revision: proposal.currentRevision, assets }, "Atomic worker settlement after all participants accepted identical terms and the review period elapsed.");
    const result = await tx.tradeProposal.update({ where: { id: proposalId }, data: { status: "EXECUTED", processedAt: at } });
    const consumed = new Set(assets.flatMap((asset) => asset.type === "PLAYER" || asset.type === "CUT" ? [`player:${asset.playerId}`] : asset.type === "PICK" ? [`pick:${asset.pickId}`] : []));
    const others = await tx.tradeProposal.findMany({ where: { leagueId: proposal.leagueId, id: { not: proposalId }, status: { in: ["PENDING", "REVIEW"] } }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
    for (const other of others) {
      const otherAssets = tradeAssetsSchema.parse(other.revisions[0].assets);
      if (!otherAssets.some((asset) => (asset.type === "PLAYER" || asset.type === "CUT") ? consumed.has(`player:${asset.playerId}`) : asset.type === "PICK" && consumed.has(`pick:${asset.pickId}`))) continue;
      if (other.status === "REVIEW") await reservations(tx, other.id, other.currentRevision, otherAssets, other.leagueId, true);
      await tx.tradeProposal.update({ where: { id: other.id }, data: { status: "INVALIDATED", processedAt: at, reason: `Conflicting asset executed in ${proposalId}` } });
    }
    return result;
  }, { isolationLevel: "Serializable", timeout: 30000 });
}

export async function processAdvancedTrades(at = new Date()) {
  if (!await hasGameplayTable("TradeProposal")) return [];
  const db = getDatabase();
  const due = await db.tradeProposal.findMany({ where: { status: { in: ["PENDING", "REVIEW"] } } });
  return Promise.all(due.map((proposal) => runBackgroundJob(`advanced-trade:${proposal.id}:${proposal.currentRevision}:${at.toISOString().slice(0, 16)}`, "advanced-trade", async () => {
    try {
      if (proposal.expiresAt > at && (proposal.status === "PENDING" || proposal.executeAt! > at)) {
        await db.$transaction(async (tx) => {
          const revision = await tx.tradeProposalRevision.findUniqueOrThrow({ where: { proposalId_version: { proposalId: proposal.id, version: proposal.currentRevision } } });
          await validateAssets(tx, proposal.leagueId, proposal.participantIds, tradeAssetsSchema.parse(revision.assets), at);
        }, { isolationLevel: "Serializable" });
        return { status: proposal.status };
      }
      return await executeAdvancedTrade(proposal.id, at);
    }
    catch (error) {
      // Serializable contention is retryable; eligibility failures close the proposal and release its reservations atomically.
      if (error && typeof error === "object" && "code" in error) throw error;
      return db.$transaction(async (tx) => {
        const current = await tx.tradeProposal.findUniqueOrThrow({ where: { id: proposal.id }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
        if (!["PENDING", "REVIEW"].includes(current.status)) return current;
        if (current.status === "REVIEW") await reservations(tx, current.id, current.currentRevision, tradeAssetsSchema.parse(current.revisions[0].assets), current.leagueId, true);
        return tx.tradeProposal.update({ where: { id: current.id }, data: { status: current.expiresAt <= at ? "EXPIRED" : "INVALIDATED", processedAt: at, reason: error instanceof Error ? error.message : "Trade eligibility changed" } });
      }, { isolationLevel: "Serializable" });
    }
  }, at)));
}
