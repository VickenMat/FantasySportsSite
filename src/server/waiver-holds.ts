import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { professionalGameProjection } from "./professional-game-state";

const releaseHoldMilliseconds = 24 * 60 * 60 * 1000;

export async function pendingGameCompletionHold(tx: Prisma.TransactionClient, playerId: string, at: Date) {
  const [result] = await tx.$queryRaw<{pending:boolean}[]>`SELECT EXISTS(
    SELECT 1 FROM "Game" game ${professionalGameProjection(at)}
    WHERE EXISTS(SELECT 1 FROM "PlayerGameStat" stat WHERE stat."gameId"=game.id AND stat."playerId"=${playerId}::uuid)
      AND source_state.sources>0 AND (source_state.status IS NULL OR source_state.status IN ('LIVE','SUSPENDED')
        OR (source_state.status='FINAL' AND source_state."completedAt" IS NULL AND NOT EXISTS(
          SELECT 1 FROM "GameCompletionEvidence" completion WHERE completion."gameId"=game.id AND completion."knownAt"<=${at}
        )))
  ) AS pending`;
  return result?.pending ?? false;
}

export async function releaseHoldUntil(tx: Prisma.TransactionClient, leagueId: string, playerId: string) {
  const lastRelease = await tx.rosterEntry.findFirst({
    where: { leagueId, playerId, releasedAt: { not: null } },
    orderBy: { releasedAt: "desc" },
    select: { releasedAt: true },
  });
  return lastRelease?.releasedAt ? new Date(lastRelease.releasedAt.getTime() + releaseHoldMilliseconds) : null;
}

export async function waiverHoldUntil(tx: Prisma.TransactionClient, leagueId: string, playerId: string, at = new Date()) {
  const [release, completion] = await Promise.all([
    releaseHoldUntil(tx, leagueId, playerId),
    tx.gameCompletionEvidence.findFirst({
      where: { knownAt: { lte: at }, game: { gameStats: { some: { playerId } } } },
      orderBy: [{ completedAt: "desc" }, { knownAt: "desc" }], select: { completedAt: true },
    }),
  ]);
  const game = completion ? new Date(completion.completedAt.getTime() + releaseHoldMilliseconds) : null;
  return [release, game].filter((value): value is Date => Boolean(value)).sort((a, b) => Number(b) - Number(a))[0] ?? null;
}

const completionSchema = z.object({
  gameId: z.uuid(), provider: z.string().trim().min(1), externalId: z.string().trim().min(1),
  completedAt: z.date(), knownAt: z.date(), sourceRecord: z.record(z.string(), z.unknown()),
}).refine(({ completedAt, knownAt }) => knownAt >= completedAt, { message: "Completion evidence cannot be known before the game completed." });

export async function recordGameCompletionEvidence(input: z.input<typeof completionSchema>, transaction?: Prisma.TransactionClient) {
  const value = completionSchema.parse(input);
  return (transaction ?? getDatabase()).gameCompletionEvidence.create({ data: { ...value, sourceRecord: value.sourceRecord as Prisma.InputJsonValue } });
}
