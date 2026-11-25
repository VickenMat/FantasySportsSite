import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

export async function setCommissionerAuditContext(tx: Prisma.TransactionClient, userId: string, action: string, reason: string) {
  await tx.$queryRaw`
    SELECT set_config('fantasy.commissioner_actor', ${userId}, true),
      set_config('fantasy.commissioner_action', ${action}, true),
      set_config('fantasy.commissioner_reason', ${reason}, true)
  `;
}

export function listCommissionerAudit(userId: string, leagueId: string) {
  return getDatabase().commissionerAuditEvent.findMany({
    where: { leagueId, league: { members: { some: { userId, role: "COMMISSIONER" } } } },
    orderBy: [{ effectiveAt: "desc" }, { id: "desc" }], take: 50,
  });
}
