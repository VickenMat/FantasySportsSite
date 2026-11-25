import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { lockSport } from "./sport-lock";

const positionCodes = { MLB: new Set(["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH", "SP", "RP", "P"]), NBA: new Set(["PG", "SG", "SF", "PF", "C", "G", "F"]) };
export const historicalPositionRepairSchema = z.object({
  sport: z.enum(["MLB", "NBA"]), sourceName: z.string().trim().min(1), sourceProvider: z.string().trim().min(1),
  rows: z.array(z.object({ playerExternalId: z.string().trim().min(1), identityProvider: z.string().trim().min(1),
    seasonStartYear: z.number().int().min(1900).max(2200), positions: z.array(z.string()).min(1),
    verificationStatus: z.literal("VERIFIED"), sourceReference: z.string().trim().min(1), knownAt: z.coerce.date(),
  })).min(1),
}).superRefine((value, context) => {
  const identities = new Set<string>();
  for (const row of value.rows) {
    const identity = `${row.identityProvider}:${row.playerExternalId}:${row.seasonStartYear}`;
    if (identities.has(identity)) context.addIssue({ code: "custom", message: `Duplicate repair identity ${identity}.` });
    identities.add(identity);
    if (new Set(row.positions).size !== row.positions.length || row.positions.some((code) => !positionCodes[value.sport].has(code))) context.addIssue({ code: "custom", message: "Use distinct verified sport position codes." });
  }
});

/** Historical observations only. Never creates current eligibility evidence or competitive score revisions. */
export async function reconcileHistoricalPositions(raw: z.input<typeof historicalPositionRepairSchema>, approval?: { expectedFingerprint: string }) {
  const input = historicalPositionRepairSchema.parse(raw);
  const sourceHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    if (approval) await lockSport(tx, input.sport);
    else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const changes = [];
    for (const row of input.rows) {
      const identity = await tx.playerExternalId.findUniqueOrThrow({ where: { sport_provider_externalId: {
        sport: input.sport, provider: row.identityProvider, externalId: row.playerExternalId,
      } } });
      const stats = await tx.playerGameStat.findMany({ where: { playerId: identity.playerId, provider: row.identityProvider, game: { season: { sport: input.sport, startYear: row.seasonStartYear } } },
        orderBy: [{ revision: "desc" }, { recordedAt: "desc" }], distinct: ["gameId", "role"],
      });
      if (!stats.length) throw new Error(`No imported appearances for ${row.playerExternalId} in ${row.seasonStartYear}; no identity will be invented.`);
      const positions = [...row.positions].sort();
      for (const stat of stats) if (JSON.stringify([...stat.observedPositions].sort()) !== JSON.stringify(positions)) {
        // Reconciliation fills missing observations. Conflicting evidence needs a separately reviewed correction.
        if (stat.observedPositions.length) throw new Error(`Conflicting historical positions for stat ${stat.id}.`);
        changes.push({ stat, positions, row });
      }
    }
    changes.sort((a, b) => a.stat.id.localeCompare(b.stat.id));
    const fingerprint = createHash("sha256").update(JSON.stringify({ sourceHash, targets: changes.map(({ stat, positions, row }) => ({ priorStatId: stat.id, priorHash: stat.contentHash, positions, sourceReference: row.sourceReference, knownAt: row.knownAt.toISOString() })) })).digest("hex");
    const report = { changes: changes.length, players: new Set(changes.map(({ stat }) => stat.playerId)).size, fingerprint, applied: Boolean(approval) };
    if (!approval || !changes.length) return report;
    if (approval.expectedFingerprint !== fingerprint) throw new Error("Historical position target fingerprint changed. Review a fresh dry run before approval.");
    const batch = await tx.importBatch.upsert({ where: { sport_provider_contentHash_importerVersion: {
      sport: input.sport, provider: input.sourceProvider, contentHash: sourceHash, importerVersion: "historical-position-repair-1",
    } }, update: {}, create: { sport: input.sport, provider: input.sourceProvider, contentHash: sourceHash, sourceName: input.sourceName,
      importerVersion: "historical-position-repair-1", correctionReason: "Approved historical observed position reconciliation; no eligibility promotion.", summary: report } });
    for (const { stat, positions, row } of changes) {
      const raw = { original: stat.raw, historicalPositionRepair: { sourceProvider: input.sourceProvider, sourceReference: row.sourceReference, positions, knownAt: row.knownAt.toISOString() } } as Prisma.InputJsonValue;
      await tx.playerGameStat.create({ data: { gameId: stat.gameId, playerId: stat.playerId, teamId: stat.teamId, importBatchId: batch.id,
        provider: stat.provider, role: stat.role, revision: stat.revision + 1, priorRevisionId: stat.id,
        contentHash: createHash("sha256").update(JSON.stringify(raw)).digest("hex"), sourceLine: stat.sourceLine,
        observedPositions: positions, normalized: stat.normalized as Prisma.InputJsonValue, raw,
        sourceKnownAt: row.knownAt,
      } });
    }
    return report;
  }, { isolationLevel: "Serializable", timeout: 120_000 });
}
