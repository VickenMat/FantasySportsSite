import { z } from "zod";
import type { Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { resolveLeagueSport } from "./league";

export async function submitWaiver(userId: string, input: { leagueId: string; sport?: Sport | string; addPlayerId: string; dropPlayerId?: string | null; bid: number; processAt?: Date }) {
  const value = z.object({ leagueId: z.uuid(), addPlayerId: z.uuid(), dropPlayerId: z.uuid().nullish(), bid: z.number().int().min(0) }).parse(input);
  const leagueSport = await resolveLeagueSport(value.leagueId, input.sport); const database = getDatabase();
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: value.leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  const roster = await database.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: membership.fantasyTeam.id, leagueSportId: leagueSport.id } } });
  if (value.bid > roster.faabRemaining) throw new Error("This bid exceeds your remaining sport FAAB.");
  const player = await database.player.findUniqueOrThrow({ where: { id: value.addPlayerId } });
  if (player.sport !== leagueSport.sport) throw new Error(`This player is not in the ${leagueSport.sport} waiver pool.`);
  if (await database.rosterEntry.findFirst({ where: { leagueId: value.leagueId, sport: leagueSport.sport, playerId: value.addPlayerId, releasedAt: null } })) throw new Error("That player is already owned in this sport.");
  if (value.dropPlayerId && !await database.rosterEntry.findFirst({ where: { rosterId: roster.id, playerId: value.dropPlayerId, releasedAt: null } })) throw new Error("The dropped player is not on your active sport roster.");
  const priority = await database.waiverClaim.count({ where: { leagueId: value.leagueId, sport: leagueSport.sport, status: "PENDING" } }) + 1;
  return database.waiverClaim.create({ data: { ...value, leagueSportId: leagueSport.id, rosterId: roster.id, sport: leagueSport.sport,
    dropPlayerId: value.dropPlayerId ?? null, teamId: membership.fantasyTeam.id, priority, processAt: input.processAt ?? new Date() } });
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
    const claims = await tx.waiverClaim.findMany({ where: { leagueId, sport: leagueSport?.sport, status: "PENDING", processAt: { lte: now } }, orderBy: [{ bid: "desc" }, { priority: "asc" }, { createdAt: "asc" }] });
    const [rosterRows, ownershipRows] = await Promise.all([
      tx.fantasyRoster.findMany({ where: { id: { in: [...new Set(claims.map(({ rosterId }) => rosterId))] } } }),
      tx.rosterEntry.findMany({ where: { leagueId, releasedAt: null, playerId: { in: [...new Set(claims.map(({ addPlayerId }) => addPlayerId))] } } }),
    ]);
    const rosters = new Map(rosterRows.map((roster) => [roster.id, roster])); const ownership = new Map(ownershipRows.map((entry) => [`${entry.sport}:${entry.playerId}`, entry])); const awarded = new Set<string>();
    for (const claim of claims) {
      const roster = rosters.get(claim.rosterId); if (!roster) throw new Error("A waiver roster disappeared during processing.");
      const key = `${claim.sport}:${claim.addPlayerId}`; const owned = ownership.get(key);
      if (awarded.has(key) || owned || claim.bid > roster.faabRemaining) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: owned || awarded.has(key) ? "LOST" : "REJECTED", reason: owned || awarded.has(key) ? "A higher-priority claim won this player." : "Insufficient FAAB.", processedAt: now } }); continue;
      }
      if (claim.dropPlayerId) await tx.rosterEntry.updateMany({ where: { rosterId: roster.id, playerId: claim.dropPlayerId, releasedAt: null }, data: { releasedAt: now, slot: "BENCH" } });
      const leagueSportRow = await tx.leagueSport.findUniqueOrThrow({ where: { id: claim.leagueSportId } });
      await tx.rosterEntry.create({ data: { leagueId, teamId: claim.teamId, rosterId: roster.id, playerId: claim.addPlayerId, sport: claim.sport, seasonId: leagueSportRow.seasonId, slot: "BENCH" } });
      await tx.fantasyRoster.update({ where: { id: roster.id }, data: { faabRemaining: { decrement: claim.bid } } }); roster.faabRemaining -= claim.bid;
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "WON", processedAt: now } });
      await tx.fantasyTransaction.create({ data: { leagueId, leagueSportId: claim.leagueSportId, rosterId: roster.id, sport: claim.sport, teamId: claim.teamId,
        playerId: claim.addPlayerId, relatedPlayerId: claim.dropPlayerId, amount: claim.bid, type: "WAIVER", note: `Waiver won for ${claim.bid} FAAB` } });
      awarded.add(key);
    }
    return claims.length;
  }, { isolationLevel: "Serializable" });
}
