import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

const evidenceSchema = z.object({
  playerId: z.uuid(), seasonId: z.uuid(), sport: z.enum(["NFL", "MLB", "NBA", "NHL"]), eligible: z.boolean(),
  effectiveAt: z.date(), knownAt: z.date(), provider: z.string().trim().min(1), externalId: z.string().trim().min(1),
  sourceRecord: z.record(z.string(), z.unknown()),
}).refine(({ effectiveAt, knownAt }) => knownAt >= effectiveAt, { message: "Rookie evidence cannot be known before it is effective." });

export async function eligibleRookieIds(tx: Prisma.TransactionClient, seasonId: string, at: Date) {
  const records = await tx.rookieEligibilityEvidence.findMany({ where: { seasonId, effectiveAt: { lte: at }, knownAt: { lte: at } },
    orderBy: [{ effectiveAt: "desc" }, { knownAt: "desc" }, { id: "desc" }], distinct: ["playerId"] });
  return records.filter(({ eligible }) => eligible).map(({ playerId }) => playerId);
}

export async function assertRookieDraftWindow(tx: Prisma.TransactionClient, leagueId: string, seasonId: string, at: Date) {
  const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId }, select: { isHistorical: true } });
  if (league.isHistorical) return;
  const boundary = await tx.professionalSeasonScheduleRevision.findFirst({ where: { seasonId, retrievedAt: { lte: at } }, orderBy: { retrievedAt: "desc" } });
  if (boundary?.status !== "AVAILABLE" || !boundary.regularSeasonStartsAt) throw new Error("PENDING_DATA: a verified season boundary is required for the rookie draft.");
  if (at >= boundary.regularSeasonStartsAt) throw new Error("Rookie drafts must finish before the sport season begins.");
}

export async function recordRookieEligibility(input: z.input<typeof evidenceSchema>, transaction?: Prisma.TransactionClient) {
  const value = evidenceSchema.parse(input);
  const database = transaction ?? getDatabase();
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
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: leagueSportId }, include: { league: true } });
  if (sport.league.format !== "DYNASTY") return;
  const completedRookie = await tx.draft.findUnique({ where: { leagueSportId_seasonId_kind: { leagueSportId, seasonId, kind: "ROOKIE" } } });
  if (completedRookie?.status === "COMPLETE") return;
  const assignment = await tx.leagueSportSeason.findUnique({ where: { leagueSportId_seasonId: { leagueSportId, seasonId } }, include: { championshipCycle: true } });
  const initial = await tx.draft.findUnique({ where: { leagueSportId_seasonId_kind: { leagueSportId, seasonId, kind: "INITIAL" } } });
  if (assignment?.championshipCycle.number === 1 && initial?.status === "COMPLETE") return;
  const evidence = await tx.rookieEligibilityEvidence.findFirst({
    where: { playerId, seasonId, knownAt: { lte: at }, effectiveAt: { lte: at } },
    orderBy: [{ effectiveAt: "desc" }, { knownAt: "desc" }, { id: "desc" }],
  });
  // Unknown status does not grant rookie eligibility. Ordinary free agents remain
  // governed by the approved verified-rookie-only pre-draft restriction.
  if (!evidence?.eligible) return;
  throw new Error("Verified rookies cannot be acquired before the applicable rookie draft completes.");
}
