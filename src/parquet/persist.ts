import { basename } from "node:path";
import type { Sport } from "@/generated/prisma/enums";
import type { HistoricalRow } from "@/imports/normalize";
import { hashFile, newSummary, type ImportSummary } from "@/imports/csv";
import { persistHistoricalRows } from "@/imports/persist";
import { historicalProvider } from "@/imports/normalize";
import { getDatabase } from "@/lib/db";
import { lockSport } from "@/server/sport-lock";
import { readHistoricalParquet } from "./read";

export const parquetImporterVersion = "historical-parquet-2";

export async function importHistoricalParquet(input: {
  path: string; sport: Sport; correctionReason?: string; allowRejected?: boolean; batchSize?: number; seasonYear?: number; excludedGameIds?: readonly string[];
}) {
  const contentHash = await hashFile(input.path);
  const exclusionKey = [...(input.excludedGameIds ?? [])].sort().join(",");
  const importerVersion = `${input.seasonYear == null ? parquetImporterVersion : `${parquetImporterVersion}-season-${input.seasonYear}`}${exclusionKey ? `-exclude-${exclusionKey}` : ""}`;
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    await lockSport(tx, input.sport);
    const key = { sport: input.sport, provider: historicalProvider, contentHash, importerVersion };
    const existing = await tx.importBatch.findUnique({ where: { sport_provider_contentHash_importerVersion: key } });
    if (existing) return { batchId: existing.id, alreadyImported: true, summary: existing.summary as ImportSummary };
    const summary = newSummary();
    const batch = await tx.importBatch.create({
      data: { ...key, sourceName: basename(input.path), correctionReason: input.correctionReason, summary },
    });
    let rows: HistoricalRow[] = [];
    for await (const row of readHistoricalParquet({ path: input.path, sport: input.sport, summary, batchSize: input.batchSize ?? 25_000, seasonYear: input.seasonYear, excludedGameIds: new Set(input.excludedGameIds) })) {
      rows.push(row);
      if (rows.length < 300) continue;
      await persistHistoricalRows(tx, input.sport, batch.id, rows, summary, input.correctionReason, historicalProvider, importerVersion);
      rows = [];
    }
    if (!summary.validRows) throw new Error(`Parquet file had no valid rows: ${JSON.stringify(summary.sampleIssues)}.`);
    if (summary.rejectedRows && !input.allowRejected) {
      throw new Error(`Parquet file had ${summary.rejectedRows} rejected rows; no changes were applied. Inspect with --validate-only.`);
    }
    if (rows.length) await persistHistoricalRows(tx, input.sport, batch.id, rows, summary, input.correctionReason, historicalProvider, importerVersion);
    await tx.importBatch.update({ where: { id: batch.id }, data: { summary } });
    return { batchId: batch.id, alreadyImported: false, summary };
  }, { maxWait: 10_000, timeout: 30 * 60_000 });
}
