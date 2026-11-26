import { z } from "zod";
import type { Sport } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { calculateEligibility, type PositionEvidence } from "@/positions/eligibility";
import { lockSport } from "./sport-lock";

const evidenceBase = z.object({
  playerId: z.uuid(),
  seasonId: z.uuid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/),
  effectiveAt: z.date(),
  knownAt: z.date(),
  provider: z.string().trim().min(1).max(100),
  externalId: z.string().trim().min(1).max(200),
});
const evidenceSchema = z.discriminatedUnion("kind", [
  evidenceBase.extend({ kind: z.literal("LISTED") }),
  evidenceBase.extend({ kind: z.literal("FIELDING"), gameId: z.uuid(), started: z.boolean() }),
]);
const mlbFieldingPositions = new Set(["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "P"]);

export async function recordPositionEvidence(input: z.input<typeof evidenceSchema>, transaction?: import("@/generated/prisma/client").Prisma.TransactionClient) {
  const evidence = evidenceSchema.parse(input);
  const database = getDatabase();
  const season = await (transaction ?? database).season.findUniqueOrThrow({ where: { id: evidence.seasonId }, select: { sport: true } });
  const work = async (tx: import("@/generated/prisma/client").Prisma.TransactionClient) => {
    await lockSport(tx, season.sport);
    const player = await tx.player.findUniqueOrThrow({ where: { id: evidence.playerId }, select: { sport: true } });
    if (player.sport !== season.sport) throw new Error("Position evidence must match the athlete's sport.");

    if (evidence.kind === "FIELDING") {
      if (season.sport !== "MLB" || !mlbFieldingPositions.has(evidence.code)) throw new Error("Use an MLB defensive position for fielding evidence.");
      const game = await tx.game.findUniqueOrThrow({ where: { id: evidence.gameId }, select: { seasonId: true, startsAt: true } });
      if (game.seasonId !== evidence.seasonId || evidence.knownAt < evidence.effectiveAt ||
        (game.startsAt && evidence.effectiveAt < game.startsAt)) {
        throw new Error("Fielding evidence must belong to the stated game and be known after the appearance.");
      }
    }

    const { code, ...data } = evidence;
    const position = await tx.position.upsert({
      where: { sport_code: { sport: season.sport, code } }, create: { sport: season.sport, code }, update: {},
    });
    const providerId = { provider: data.provider, externalId: data.externalId };
    const gameId = data.kind === "FIELDING" ? data.gameId : null;
    const started = data.kind === "FIELDING" ? data.started : null;

    const existing = await tx.playerPositionEvidence.findUnique({ where: { provider_externalId: providerId } });
    if (existing) {
      if (existing.playerId !== data.playerId || existing.seasonId !== data.seasonId ||
        existing.positionId !== position.id || existing.kind !== data.kind || existing.gameId !== gameId ||
        existing.started !== started || existing.effectiveAt.getTime() !== data.effectiveAt.getTime() ||
        existing.knownAt.getTime() !== data.knownAt.getTime()) {
        throw new Error("Position evidence already exists with different contents.");
      }
      return existing;
    }
    return tx.playerPositionEvidence.create({ data: { ...data, positionId: position.id, gameId, started } });
  };
  return transaction ? work(transaction) : database.$transaction(work);
}

export async function getEligiblePositions(input: { playerId: string; sport: Sport; seasonYear: number; asOf: Date }, client: Pick<ReturnType<typeof getDatabase>, "playerPositionEvidence"> & Partial<Pick<ReturnType<typeof getDatabase>,"professionalDataObservation">> = getDatabase()) {
  const { playerId, sport, seasonYear, asOf } = input;
  const records = await client.playerPositionEvidence.findMany({
    where: {
      playerId, knownAt: { lte: asOf }, effectiveAt: { lte: asOf },
      season: { sport, startYear: { in: sport === "MLB" ? [seasonYear - 1, seasonYear] : [seasonYear] } },
    },
    include: { season: { select: { startYear: true } }, position: { select: { code: true } } },
  });
  const inactiveEvidence = new Set<string>();
  if (client.professionalDataObservation) {
    const revisions = await client.professionalDataObservation.findMany({ where: { sport, category: "POSITION_REVISION", publishedAt: { lte: asOf }, effectiveAt: { lte: asOf }, decisions: { some: { outcome: "ACCEPTED", targets: { path: ["playerId"], equals: playerId } } } },
      include: { decisions: { where: { outcome: "ACCEPTED" }, orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ revisionOrdinal: "desc" }, { publishedAt: "desc" }, { id: "asc" }] });
    const latest = new Set<string>();
    for (const revision of revisions) {
      const targets = revision.decisions[0]?.targets as { originalEvidenceId?: string; replacementEvidenceIds?: string[] };
      if (targets.originalEvidenceId) inactiveEvidence.add(targets.originalEvidenceId);
      const key = `${revision.provider}:${revision.entityKey}`;
      if (latest.has(key)) for (const id of targets.replacementEvidenceIds ?? []) inactiveEvidence.add(id);
      latest.add(key);
    }
  }
  const evidence = records.filter(row=>!inactiveEvidence.has(row.id)).flatMap((row): PositionEvidence[] => {
    const base = {
      code: row.position.code, seasonYear: row.season.startYear, effectiveAt: row.effectiveAt, knownAt: row.knownAt,
    };
    if (row.kind === "LISTED") return [{ ...base, kind: "LISTED" }];
    return row.gameId && row.started != null ? [{ ...base, kind: "FIELDING", gameId: row.gameId, started: row.started }] : [];
  });
  const result = calculateEligibility({ ...input, evidence });
  return { ...result, available: result.available || records.some(row=>inactiveEvidence.has(row.id)) };
}

/** Historical repairs are display evidence, never a fallback grant of current eligibility. */
export function legacyPositionFallback(stat?: { observedPositions: string[]; raw: unknown } | null): string[] {
  if (!stat) return [];
  if (stat.raw && typeof stat.raw === "object" && "historicalPositionRepair" in stat.raw) return [];
  return stat.observedPositions;
}
