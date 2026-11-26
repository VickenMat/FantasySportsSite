import type { Prisma } from "@/generated/prisma/client";
import { availabilityDesignationAllowsIr } from "./lineup-snapshots";

export async function irEligiblePlayers(tx: Prisma.TransactionClient, playerIds: readonly string[], at: Date) {
  if (!playerIds.length) return new Set<string>();
  const evidence = await tx.playerAvailabilityEvidence.findMany({
    where: { playerId: { in: [...playerIds] }, effectiveAt: { lte: at }, knownAt: { lte: at } },
    orderBy: [{ effectiveAt: "desc" }, { knownAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    distinct: ["playerId"],
    select: { playerId: true, player: { select: { sport: true } }, irEligible: true, designation: true, expiresAt: true },
  });
  return new Set(evidence.filter((row) =>
    row.irEligible && availabilityDesignationAllowsIr(row.designation, row.player.sport) && (!row.expiresAt || row.expiresAt > at))
    .map(({ playerId }) => playerId));
}
