import type { Prisma } from "@/generated/prisma/client";

/** Unknown professional bounds never imply an offseason. */
export async function sportIsOffseason(tx: Prisma.TransactionClient, leagueSportId: string, at: Date) {
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: leagueSportId } });
  const source = await tx.professionalSeasonScheduleRevision.findFirst({ where: { seasonId: sport.seasonId, retrievedAt: { lte: at } }, orderBy: { retrievedAt: "desc" } });
  if (source?.status !== "AVAILABLE" || !source.regularSeasonStartsAt || !source.regularSeasonEndsAt) return false;
  const endsAt = source.postseasonEndsAt ?? source.regularSeasonEndsAt;
  return at < source.regularSeasonStartsAt || at >= endsAt;
}

export async function clearOffseasonPlayerFloors(tx: Prisma.TransactionClient, leagueSportId: string, actorUserId: string, at: Date) {
  if (!await sportIsOffseason(tx, leagueSportId, at)) return 0;
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: leagueSportId } });
  const floors = await tx.releasedPlayerFloor.findMany({ where: { leagueId: sport.leagueId, player: { sport: sport.sport, rosterEntries: { none: { leagueId: sport.leagueId, releasedAt: null } } } } });
  if (!floors.length) return 0;
  await tx.commissionerAuditEvent.create({ data: { leagueId: sport.leagueId, actorUserId, action: "OFFSEASON_PLAYER_FLOOR_EXPIRY", targetType: "LeagueSport", targetId: leagueSportId, sport: sport.sport,
    before: { floors: floors.map(({ playerId, amount }) => ({ playerId, amount })) }, after: { removed: floors.length }, effectiveAt: at,
    reason: "Source-verified sport offseason: free-agent acquisition floors expire independently of franchise dead-cap obligations." } });
  await tx.releasedPlayerFloor.deleteMany({ where: { id: { in: floors.map(({ id }) => id) } } });
  return floors.length;
}
