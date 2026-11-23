import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { fitsSlot } from "@/simulation/config";

async function managedTeam(userId: string, leagueId: string) {
  const membership = await getDatabase().leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true, league: true },
  });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a team in this league.");
  return membership;
}

export async function addFreeAgent(userId: string, leagueId: string, playerId: string) {
  z.uuid().parse(playerId);
  const membership = await managedTeam(userId, leagueId);
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.sport !== membership.league.primarySport) throw new Error("This player belongs to another sport.");
    const count = await tx.rosterEntry.count({ where: { teamId: membership.fantasyTeam!.id } });
    if (count >= membership.league.rosterSlots.length + membership.league.benchSlots) throw new Error("Your roster is full.");
    const entry = await tx.rosterEntry.create({ data: { leagueId, teamId: membership.fantasyTeam!.id, playerId, slot: "BENCH" } });
    await tx.fantasyTransaction.create({ data: { leagueId, teamId: membership.fantasyTeam!.id, playerId, type: "ADD", note: "Free-agent add" } });
    return entry;
  }, { isolationLevel: "Serializable" });
}

export async function dropPlayer(userId: string, leagueId: string, playerId: string) {
  const membership = await managedTeam(userId, leagueId);
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const entry = await tx.rosterEntry.findUnique({ where: { leagueId_playerId: { leagueId, playerId } } });
    if (!entry || entry.teamId !== membership.fantasyTeam!.id) throw new Error("That player is not on your roster.");
    if (entry.lockedAt) throw new Error("That roster slot is locked.");
    await tx.rosterEntry.delete({ where: { id: entry.id } });
    await tx.fantasyTransaction.create({ data: { leagueId, teamId: entry.teamId, playerId, type: "DROP", note: "Player dropped" } });
  });
}

export async function setLineupSlot(userId: string, leagueId: string, rosterEntryId: string, slot: string) {
  const membership = await managedTeam(userId, leagueId);
  const normalizedSlot = z.string().trim().toUpperCase().max(20).parse(slot);
  const entry = await getDatabase().rosterEntry.findUnique({
    where: { id: rosterEntryId }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } },
  });
  if (!entry || entry.teamId !== membership.fantasyTeam!.id) throw new Error("That roster entry is unavailable.");
  if (entry.lockedAt) throw new Error("That roster slot is locked.");
  if (normalizedSlot !== "BENCH") {
    const allowed = membership.league.rosterSlots.filter((value) => value === normalizedSlot).length;
    if (!allowed) throw new Error("That slot is not configured for this league.");
    const used = await getDatabase().rosterEntry.count({ where: { teamId: entry.teamId, slot: normalizedSlot, id: { not: entry.id } } });
    if (used >= allowed) throw new Error("Every configured copy of that slot is occupied.");
    const positions = entry.player.gameStats[0]?.observedPositions ?? [];
    if (!membership.league.primarySport || !fitsSlot(membership.league.primarySport, normalizedSlot, new Set(positions))) {
      throw new Error("The player's recorded eligibility does not fit that slot.");
    }
  }
  return getDatabase().rosterEntry.update({ where: { id: entry.id }, data: { slot: normalizedSlot } });
}
