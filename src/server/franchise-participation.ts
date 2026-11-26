import type { Prisma } from "@/generated/prisma/client";

/** The append-only archive event is authoritative; historical franchise rows remain addressable. */
export async function activeFranchises<T extends { id: string }>(tx: Prisma.TransactionClient, leagueId: string, teams: T[]): Promise<T[]> {
  const archived = new Set((await tx.commissionerAuditEvent.findMany({ where: { leagueId, action: "ARCHIVE_FRANCHISE", targetType: "FantasyTeam" }, select: { targetId: true } })).map(({ targetId }) => targetId));
  return teams.filter(({ id }) => !archived.has(id));
}
