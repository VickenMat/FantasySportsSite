import { z } from "zod";
import { getDatabase } from "@/lib/db";

export async function submitWaiver(userId: string, input: {
  leagueId: string; addPlayerId: string; dropPlayerId?: string | null; bid: number; processAt?: Date;
}) {
  const value = z.object({ leagueId: z.uuid(), addPlayerId: z.uuid(), dropPlayerId: z.uuid().nullish(), bid: z.number().int().min(0) }).parse(input);
  const database = getDatabase();
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: value.leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a team in this league.");
  if (value.bid > membership.fantasyTeam.faabRemaining) throw new Error("This bid exceeds your remaining FAAB.");
  if (await database.rosterEntry.findUnique({ where: { leagueId_playerId: { leagueId: value.leagueId, playerId: value.addPlayerId } } })) {
    throw new Error("That player is already owned.");
  }
  if (value.dropPlayerId && !await database.rosterEntry.findFirst({ where: { leagueId: value.leagueId, teamId: membership.fantasyTeam.id, playerId: value.dropPlayerId } })) {
    throw new Error("The dropped player is not on your roster.");
  }
  const priority = await database.waiverClaim.count({ where: { leagueId: value.leagueId, status: "PENDING" } }) + 1;
  return database.waiverClaim.create({ data: {
    ...value, dropPlayerId: value.dropPlayerId ?? null, teamId: membership.fantasyTeam.id,
    priority, processAt: input.processAt ?? new Date(),
  } });
}

export async function processWaivers(userId: string, leagueId: string, now = new Date()) {
  const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can process waivers.");
  return processDueWaivers(leagueId, now);
}

export async function processDueWaivers(leagueId: string, now = new Date()) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const claims = await tx.waiverClaim.findMany({
      where: { leagueId, status: "PENDING", processAt: { lte: now } },
      orderBy: [{ bid: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
    });
    const [teamRows, ownershipRows] = await Promise.all([
      tx.fantasyTeam.findMany({ where: { id: { in: [...new Set(claims.map(({ teamId }) => teamId))] } } }),
      tx.rosterEntry.findMany({ where: { leagueId, playerId: { in: [...new Set(claims.map(({ addPlayerId }) => addPlayerId))] } } }),
    ]);
    const teams = new Map(teamRows.map((team) => [team.id, team]));
    const ownership = new Map(ownershipRows.map((entry) => [entry.playerId, entry]));
    const awarded = new Set<string>();
    for (const claim of claims) {
      const team = teams.get(claim.teamId);
      if (!team) throw new Error("A waiver team disappeared during processing.");
      const owned = ownership.get(claim.addPlayerId);
      if (awarded.has(claim.addPlayerId) || owned || claim.bid > team.faabRemaining) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: {
          status: owned || awarded.has(claim.addPlayerId) ? "LOST" : "REJECTED",
          reason: owned || awarded.has(claim.addPlayerId) ? "A higher-priority claim won this player." : "Insufficient FAAB.", processedAt: now,
        } });
        continue;
      }
      if (claim.dropPlayerId) await tx.rosterEntry.delete({ where: { leagueId_playerId: { leagueId, playerId: claim.dropPlayerId } } });
      await tx.rosterEntry.create({ data: { leagueId, teamId: claim.teamId, playerId: claim.addPlayerId, slot: "BENCH" } });
      await tx.fantasyTeam.update({ where: { id: claim.teamId }, data: { faabRemaining: { decrement: claim.bid } } });
      team.faabRemaining -= claim.bid;
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "WON", processedAt: now } });
      await tx.fantasyTransaction.create({ data: {
        leagueId, teamId: claim.teamId, playerId: claim.addPlayerId, relatedPlayerId: claim.dropPlayerId,
        amount: claim.bid, type: "WAIVER", note: `Waiver won for ${claim.bid} FAAB`,
      } });
      awarded.add(claim.addPlayerId);
    }
    return claims.length;
  }, { isolationLevel: "Serializable" });
}
