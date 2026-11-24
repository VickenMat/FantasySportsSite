import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet";
import type { Sport } from "@/generated/prisma/enums";
import { InvalidHistoricalRow, normalizeHistoricalRow, validateHeaders, type HistoricalRow, type RawRow } from "@/imports/normalize";
import { newSummary, rejectRow, type ImportSummary } from "@/imports/csv";
import { parquetSources, startYear } from "./config";

function strings(row: Record<string, unknown>): RawRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)],
  ));
}

export async function* readHistoricalParquet(input: {
  path: string; sport: Sport; summary: ImportSummary; batchSize?: number; seasonYear?: number; excludedGameIds?: ReadonlySet<string>;
}): AsyncGenerator<HistoricalRow> {
  const batchSize = input.batchSize ?? 25_000;
  const file = await asyncBufferFromFile(input.path);
  const metadata = await parquetMetadataAsync(file);
  const columns = parquetSchema(metadata).children.map(({ element }) => element.name);
  validateHeaders(input.sport, columns);
  const rowCount = Number(metadata.num_rows);
  for (let rowStart = 0; rowStart < rowCount; rowStart += batchSize) {
    const rows = await parquetReadObjects({ file, rowStart, rowEnd: Math.min(rowCount, rowStart + batchSize) });
    for (let index = 0; index < rows.length; index++) {
      if (input.seasonYear != null && startYear(rows[index][parquetSources[input.sport].seasonColumn]) !== input.seasonYear) continue;
      const line = rowStart + index + 1;
      input.summary.sourceRows++;
      let normalized: HistoricalRow;
      try {
        normalized = normalizeHistoricalRow(input.sport, strings(rows[index]), line);
      } catch (error) {
        if (!(error instanceof InvalidHistoricalRow)) throw error;
        rejectRow(input.summary, line, error.message);
        continue;
      }
      if (input.excludedGameIds?.has(normalized.game.externalId)) {
        rejectRow(input.summary, line, `Quarantined conflicting game ${normalized.game.externalId}.`);
        continue;
      }
      input.summary.validRows++;
      const season = input.summary.seasons[normalized.season.label] ??= { coverage: normalized.season.coverage, validRows: 0 };
      season.validRows++;
      if (!normalized.observedPositions.length) input.summary.rowsWithoutPosition++;
      if (!normalized.game.gameDate) input.summary.rowsWithoutGameDate++;
      for (const [key, value] of Object.entries(normalized.stats)) if (value == null) {
        const category = `${normalized.role}:${key}`;
        input.summary.missingStats[category] = (input.summary.missingStats[category] ?? 0) + 1;
      }
      yield normalized;
    }
  }
}

export async function validateHistoricalParquet(path: string, sport: Sport, batchSize?: number, seasonYear?: number, excludedGameIds?: ReadonlySet<string>) {
  const summary = newSummary();
  for await (const row of readHistoricalParquet({ path, sport, summary, batchSize, seasonYear, excludedGameIds })) void row;
  return summary;
}
