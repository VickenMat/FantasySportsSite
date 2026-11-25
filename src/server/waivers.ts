import { z } from "zod";
import type { Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { resolveLeagueSport } from "./league";
import { currentCompliance } from "./rosters";
import { releaseHoldUntil } from "./waiver-holds";

export async function reservedSportFaab(tx: Prisma.TransactionClient, rosterId: string) {
  const pending = await tx.waiverClaim.aggregate({ where: { rosterId, status: "PENDING" }, _sum: { bid: true } });
  return pending._sum.bid ?? 0;
}

export async function submitWaiver(userId: string, input: { leagueId: string; sport?: Sport | string; addPlayerId: string; dropPlayerId?: string | null; bid: number; processAt?: Date }) {
  const value = z.object({ leagueId: z.uuid(), addPlayerId: z.uuid(), dropPlayerId: z.uuid().nullish(), bid: z.number().int().min(0) }).parse(input);
  const customTime = z.date().optional().parse(input.processAt);
  const leagueSport = await resolveLeagueSport(value.leagueId, input.sport);
  return getDatabase().$transaction(async (tx) => {
    const membership = await tx.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: value.leagueId, userId } }, include: { fantasyTeam: true },
    });
    if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
    const teamId = membership.fantasyTeam.id;
    const now = new Date();
    const roster = await tx.fantasyRoster.findUniqueOrThrow({
      where: { teamId_leagueSportId: { teamId, leagueSportId: leagueSport.id } },
    });
    const reserved = await reservedSportFaab(tx, roster.id);
    if (value.bid > Math.max(0, roster.faabRemaining - reserved)) throw new Error("This bid exceeds your unreserved sport FAAB.");
    const compliance = await currentCompliance(tx, teamId, now);
    if (compliance.state !== "COMPLIANT") throw new Error("Resolve roster noncompliance before submitting a waiver claim.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: value.addPlayerId } });
    if (player.sport !== leagueSport.sport) throw new Error(`This player is not in the ${leagueSport.sport} waiver pool.`);
    if (await tx.rosterEntry.findFirst({ where: { leagueId: value.leagueId, playerId: value.addPlayerId, releasedAt: null } })) {
      throw new Error("That player is already owned in this sport.");
    }
    if (await tx.waiverClaim.findFirst({ where: { rosterId: roster.id, addPlayerId: player.id, status: "PENDING" } })) {
      throw new Error("Your roster already has a pending claim for this player.");
    }
    if (value.dropPlayerId && !await tx.rosterEntry.findFirst({
      where: { rosterId: roster.id, playerId: value.dropPlayerId, releasedAt: null },
    })) throw new Error("The dropped player is not on your active sport roster.");
    const hold = await releaseHoldUntil(tx, value.leagueId, player.id);
    const processAt = new Date(Math.max(Number(now), Number(customTime ?? now), Number(hold ?? now)));
    const priority = await tx.waiverClaim.count({ where: { leagueId: value.leagueId, sport: leagueSport.sport, status: "PENDING" } }) + 1;
    return tx.waiverClaim.create({ data: {
      ...value, leagueSportId: leagueSport.id, rosterId: roster.id, sport: leagueSport.sport, teamId, priority, processAt,
    } });
  }, { isolationLevel: "Serializable" });
}

export async function processWaivers(userId: string, leagueId: string, now = new Date(), sport?: Sport | string) {
  const database = getDatabase(); const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can process waivers.");
  return processDueWaivers(leagueId, now, sport);
}

export async function cancelWaiver(userId: string, claimId: string) {
  z.uuid().parse(claimId); const database = getDatabase();
  return database.$transaction(async (tx) => {
    const claim = await tx.waiverClaim.findUniqueOrThrow({ where: { id: claimId }, include: { team: true } });
    if (claim.team.managerId !== userId) throw new Error("Only the claiming manager can cancel this waiver claim.");
    if (claim.status !== "PENDING") throw new Error("Only a pending claim can be cancelled.");
    return tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "CANCELLED", processedAt: new Date(), reason: "Cancelled by manager." } });
  }, { isolationLevel: "Serializable" });
}

export async function processDueWaivers(leagueId: string, now = new Date(), requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = requestedSport ? await resolveLeagueSport(leagueId, requestedSport) : null;
  return database.$transaction(async (tx) => {
    const claims = await tx.waiverClaim.findMany({ where: { leagueId, sport: leagueSport?.sport, status: "PENDING", processAt: { lte: now } }, orderBy: [{ bid: "desc" }, { priority: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    if (!claims.length) return 0;
    const rosterRows = await tx.fantasyRoster.findMany({ where: { id: { in: [...new Set(claims.map(({ rosterId }) => rosterId))] } } });
    const ownershipRows = await tx.rosterEntry.findMany({ where: {
      leagueId, releasedAt: null, playerId: { in: [...new Set(claims.map(({ addPlayerId }) => addPlayerId))] },
    } });
    const rosters = new Map(rosterRows.map((roster) => [roster.id, roster])); const ownership = new Map(ownershipRows.map((entry) => [`${entry.sport}:${entry.playerId}`, entry])); const awarded = new Set<string>();
    let processed = 0;
    for (const claim of claims) {
      const roster = rosters.get(claim.rosterId); if (!roster) throw new Error("A waiver roster disappeared during processing.");
      const key = `${claim.sport}:${claim.addPlayerId}`; const owned = ownership.get(key);
      if (!awarded.has(key) && !owned) {
        const hold = await releaseHoldUntil(tx, leagueId, claim.addPlayerId);
        if (hold && hold > now) {
          await tx.waiverClaim.update({ where: { id: claim.id }, data: { processAt: hold } });
          continue;
        }
      }
      processed++;
      if (awarded.has(key) || owned || claim.bid > roster.faabRemaining) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: owned || awarded.has(key) ? "LOST" : "REJECTED", reason: owned || awarded.has(key) ? "A higher-priority claim won this player." : "Insufficient FAAB.", processedAt: now } }); continue;
      }
      const dropped = claim.dropPlayerId ? await tx.rosterEntry.findFirst({ where: { rosterId: roster.id, playerId: claim.dropPlayerId, releasedAt: null } }) : null;
      const compliance = await currentCompliance(tx, claim.teamId, now);
      if (compliance.state !== "COMPLIANT" || (claim.dropPlayerId && (!dropped || dropped.lockedAt))) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: {
          status: "REJECTED", reason: compliance.state !== "COMPLIANT" ? "Roster is noncompliant." : "The designated drop is unavailable.", processedAt: now,
        } });
        continue;
      }
      const leagueSportRow = await tx.leagueSport.findUniqueOrThrow({ where: { id: claim.leagueSportId } });
      const bench = await tx.rosterEntry.findMany({ where: { rosterId: roster.id, releasedAt: null, slot: "BENCH", id: dropped ? { not: dropped.id } : undefined }, select: { slotIndex: true } });
      const used = new Set(bench.map(({ slotIndex }) => slotIndex)); let slotIndex = 1;
      while (used.has(slotIndex) && slotIndex <= leagueSportRow.benchSlots) slotIndex++;
      if (slotIndex > leagueSportRow.benchSlots) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "REJECTED", reason: "No sport bench position is available.", processedAt: now } });
        continue;
      }
      if (dropped) {
        await tx.rosterEntry.update({ where: { id: dropped.id }, data: { releasedAt: now } });
        await tx.rosterAssignmentEvent.create({ data: { leagueId, teamId: dropped.teamId, rosterEntryId: dropped.id,
          fromSlot: dropped.slot, fromSlotIndex: dropped.slotIndex, toSlot: "RELEASED", toSlotIndex: 1, effectiveAt: now,
          reason: "Waiver corresponding drop", idempotencyKey: `waiver-drop:${claim.id}` } });
      }
      const added = await tx.rosterEntry.create({ data: { leagueId, teamId: claim.teamId, rosterId: roster.id, playerId: claim.addPlayerId, sport: claim.sport, seasonId: leagueSportRow.seasonId, slot: "BENCH", slotIndex, acquiredAt: now } });
      await tx.rosterAssignmentEvent.create({ data: { leagueId, teamId: claim.teamId, rosterEntryId: added.id, toSlot: "BENCH", toSlotIndex: slotIndex,
        effectiveAt: now, reason: "Waiver acquisition", idempotencyKey: `waiver-add:${claim.id}` } });
      await tx.fantasyRoster.update({ where: { id: roster.id }, data: { faabRemaining: { decrement: claim.bid } } }); roster.faabRemaining -= claim.bid;
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "WON", processedAt: now } });
      await tx.fantasyTransaction.create({ data: { leagueId, leagueSportId: claim.leagueSportId, rosterId: roster.id, sport: claim.sport, teamId: claim.teamId,
        playerId: claim.addPlayerId, relatedPlayerId: claim.dropPlayerId, amount: claim.bid, type: "WAIVER", note: `Waiver won for ${claim.bid} FAAB` } });
      awarded.add(key);
    }
    return processed;
  }, { isolationLevel: "Serializable" });
}
