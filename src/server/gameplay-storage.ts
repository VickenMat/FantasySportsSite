import { getDatabase } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function hasGameplayTable(name: "DraftPlan" | "DraftSelectionSnapshot" | "LeagueFinancePolicy" | "FinanceAccount" | "TradeProposal" | "FantasyWindowRevision" | "RookieDraftRule", tx: Prisma.TransactionClient = getDatabase()) {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
  const [row] = await tx.$queryRaw<{ available: boolean }[]>`SELECT to_regclass(${`"${schema.replaceAll('"', '""')}"."${name}"`}) IS NOT NULL AS available`;
  return Boolean(row?.available);
}

export async function hasSeasonScopedSchedules(tx: Prisma.TransactionClient = getDatabase()) {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
  const [row] = await tx.$queryRaw<{ available: boolean }[]>`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=${schema} AND table_name='RelativeMatchupPeriod' AND column_name='seasonId') AS available`;
  return Boolean(row?.available);
}
