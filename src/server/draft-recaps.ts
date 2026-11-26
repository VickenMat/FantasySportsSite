import type { Prisma } from "@/generated/prisma/client";
import { hasGameplayTable } from "./gameplay-storage";
import { getEligiblePositions } from "./positions";

export async function captureDraftSelection(tx: Prisma.TransactionClient, pickId: string, originalTeamId: string, method: string, price: number | null = null) {
  if (!await hasGameplayTable("DraftSelectionSnapshot", tx)) return;
  const pick = await tx.draftPick.findUniqueOrThrow({ where: { id: pickId }, include: { team: true, player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  const original = await tx.fantasyTeam.findUniqueOrThrow({ where: { id: originalTeamId } });
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: original.leagueId, sport: pick.player.sport } }, include: { season: true } });
  const eligibility = await getEligiblePositions({ playerId: pick.playerId, sport: pick.player.sport, seasonYear: sport.season.startYear, asOf: pick.pickedAt }, tx);
  const data = { pickId, playerName: pick.player.displayName, franchiseName: pick.team.name, originalTeamId,
    originalTeamName: original.name, sport: pick.player.sport, positions: eligibility.positions.length ? eligibility.positions : pick.player.gameStats[0]?.observedPositions ?? [], method, price };
  const prior = await tx.draftSelectionSnapshot.findUnique({ where: { pickId } });
  if (!prior) await tx.draftSelectionSnapshot.create({ data });
  const undo = await tx.commissionerAuditEvent.findFirst({ where: { targetId: pickId, action: "UNDO_DRAFT_PICK" }, orderBy: { effectiveAt: "desc" } });
  if (undo) {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: pick.draftId } });
    const generation = JSON.parse(draft.orderProvenance!).correctionGeneration;
    await tx.commissionerAuditEvent.create({ data: { leagueId: original.leagueId, actorUserId: undo.actorUserId, action: "RESELECT_DRAFT_PICK", targetType: "DraftPick", targetId: pickId, sport: pick.player.sport, before: { originalSnapshot: JSON.parse(JSON.stringify(prior)), undoEventId: undo.id }, after: { ...data, draftId: draft.id, generation, void: false }, reason: `Replacement selection after audited undo ${undo.id}: ${undo.reason}` } });
  }
}
