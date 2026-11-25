import type { Prisma } from "@/generated/prisma/client";

const releaseHoldMilliseconds = 24 * 60 * 60 * 1000;

export async function releaseHoldUntil(tx: Prisma.TransactionClient, leagueId: string, playerId: string) {
  const lastRelease = await tx.rosterEntry.findFirst({
    where: { leagueId, playerId, releasedAt: { not: null } },
    orderBy: { releasedAt: "desc" },
    select: { releasedAt: true },
  });
  return lastRelease?.releasedAt ? new Date(lastRelease.releasedAt.getTime() + releaseHoldMilliseconds) : null;
}
