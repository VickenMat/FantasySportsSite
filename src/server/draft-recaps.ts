import type { Prisma } from "@/generated/prisma/client";
import { hasGameplayTable } from "./gameplay-storage";
import { getEligiblePositions } from "./positions";

export async function captureDraftSelection(tx: Prisma.TransactionClient, pickId: string, originalTeamId: string, method: string, price: number | null = null) {
  if (!await hasGameplayTable("DraftSelectionSnapshot", tx)) return;
  const pick = await tx.draftPick.findUniqueOrThrow({ where: { id: pickId }, include: { team: true, player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  const original = await tx.fantasyTeam.findUniqueOrThrow({ where: { id: originalTeamId } });
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: original.leagueId, sport: pick.player.sport } }, include: { season: true } });
  const eligibility = await getEligiblePositions({ playerId: pick.playerId, sport: pick.player.sport, seasonYear: sport.season.startYear, asOf: pick.pickedAt }, tx);
  await tx.draftSelectionSnapshot.create({ data: { pickId, playerName: pick.player.displayName, franchiseName: pick.team.name, originalTeamId,
    originalTeamName: original.name, sport: pick.player.sport, positions: eligibility.positions.length ? eligibility.positions : pick.player.gameStats[0]?.observedPositions ?? [], method, price } });
}
