import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { captureDueGameLineups } from "./lineup-snapshots";
import { currentCompliance } from "./rosters";

export async function commissionerRelease(userId: string, leagueId: string, entryId: string, reason: string) {
  z.string().trim().min(10).max(1000).parse(reason);
  await captureDueGameLineups(new Date());
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can correct another franchise's roster.");
    const entry = await tx.rosterEntry.findFirstOrThrow({ where: { id: entryId, leagueId }, include: { fantasyRoster: true } });
    if (entry.releasedAt) return;
    if (entry.lockedAt) throw new Error("A locked roster entry cannot be released; its game snapshot must remain intact.");
    const at = new Date();
    await tx.rosterEntry.update({ where: { id: entryId }, data: { releasedAt: at } });
    await tx.rosterAssignmentEvent.create({ data: { leagueId, teamId: entry.teamId, rosterEntryId: entryId, actorUserId: userId,
      fromSlot: entry.slot, fromSlotIndex: entry.slotIndex, toSlot: "RELEASED", toSlotIndex: 1, effectiveAt: at,
      reason, idempotencyKey: `commissioner-release:${entryId}` } });
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "RELEASE_ROSTER_PLAYER", targetType: "RosterEntry", targetId: entryId, sport: entry.sport,
      before: { teamId: entry.teamId, playerId: entry.playerId, slot: entry.slot, slotIndex: entry.slotIndex }, after: { releasedAt: at.toISOString() }, reason } });
    await tx.fantasyTransaction.create({ data: { leagueId, leagueSportId: entry.fantasyRoster.leagueSportId, rosterId: entry.rosterId, sport: entry.sport, teamId: entry.teamId,
      playerId: entry.playerId, type: "DROP", note: `Commissioner release: ${reason}` } });
    return currentCompliance(tx, entry.teamId, at);
  }, { isolationLevel: "Serializable" });
}
