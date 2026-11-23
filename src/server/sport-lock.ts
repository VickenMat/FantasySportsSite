import type { Sport } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const sportKey: Record<Sport, number> = { NFL: 1, MLB: 2, NBA: 3, NHL: 4 };

export async function lockSport(tx: Prisma.TransactionClient, sport: Sport) {
  // Shared by imports and ledger writes so a calculation cannot race a stat revision.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(182640, ${sportKey[sport]}::integer)`;
}
