import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

const evidenceSchema = z.object({
  playerId: z.uuid(), seasonId: z.uuid(), sport: z.enum(["NFL", "MLB", "NBA", "NHL"]), eligible: z.boolean(),
  effectiveAt: z.date(), knownAt: z.date(), provider: z.string().trim().min(1), externalId: z.string().trim().min(1),
  sourceRecord: z.record(z.string(), z.unknown()),
}).refine(({ effectiveAt, knownAt }) => knownAt >= effectiveAt, { message: "Rookie evidence cannot be known before it is effective." });

export async function recordRookieEligibility(input: z.input<typeof evidenceSchema>) {
  const value = evidenceSchema.parse(input);
  const database = getDatabase();
  const [player, season] = await Promise.all([
    database.player.findUniqueOrThrow({ where: { id: value.playerId } }),
    database.season.findUniqueOrThrow({ where: { id: value.seasonId } }),
  ]);
  if (player.sport !== value.sport || season.sport !== value.sport) throw new Error("Rookie evidence must match the player and season sport.");
  return database.rookieEligibilityEvidence.create({ data: { ...value, sourceRecord: value.sourceRecord as Prisma.InputJsonValue } });
}

export async function assertRookieDraftComplete(
  tx: Prisma.TransactionClient,
  leagueSportId: string,
  seasonId: string,
  playerId: string,
  at: Date,
) {
  const evidence = await tx.rookieEligibilityEvidence.findFirst({
    where: { playerId, seasonId, knownAt: { lte: at }, effectiveAt: { lte: at } },
    orderBy: [{ effectiveAt: "desc" }, { knownAt: "desc" }, { id: "desc" }],
  });
  if (!evidence?.eligible) return;
  if (!await tx.draft.findUnique({ where: {
    leagueSportId_seasonId_kind: { leagueSportId, seasonId, kind: "ROOKIE" },
  } }).then((draft) => draft?.status === "COMPLETE")) throw new Error("Verified rookies cannot be acquired before the applicable rookie draft completes.");
}
