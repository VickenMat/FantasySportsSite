import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDatabase } from "@/lib/db";

const releaseHoldMilliseconds = 24 * 60 * 60 * 1000;

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

export async function recordGameCompletionEvidence(input: z.input<typeof completionSchema>) {
  const value = completionSchema.parse(input);
  return getDatabase().gameCompletionEvidence.create({ data: { ...value, sourceRecord: value.sourceRecord as Prisma.InputJsonValue } });
}
