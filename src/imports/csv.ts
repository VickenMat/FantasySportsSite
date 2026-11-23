import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import type { Sport } from "@/generated/prisma/enums";
import { InvalidHistoricalRow, normalizeHistoricalRow, validateHeaders, type HistoricalRow, type RawRow } from "./normalize";

export type ImportSummary = {
  sourceRows: number;
  validRows: number;
  rejectedRows: number;
  insertedRows: number;
  duplicateRows: number;
  revisedRows: number;
  rowsWithoutPosition: number;
  rowsWithoutGameDate: number;
  missingStats: Record<string, number>;
  seasons: Record<string, { coverage: HistoricalRow["season"]["coverage"]; validRows: number }>;
  sampleIssues: { line: number; message: string }[];
};

export function newSummary(): ImportSummary {
  return {
    sourceRows: 0, validRows: 0, rejectedRows: 0, insertedRows: 0, duplicateRows: 0, revisedRows: 0,
    rowsWithoutPosition: 0, rowsWithoutGameDate: 0, missingStats: {}, seasons: {}, sampleIssues: [],
  };
}

export function rejectRow(summary: ImportSummary, line: number, message: string) {
  summary.rejectedRows++;
  if (summary.sampleIssues.length < 30) summary.sampleIssues.push({ line, message });
}

export async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function* readHistoricalCsv(path: string, sport: Sport, summary: ImportSummary, expectedHash?: string) {
  let headerRead = false;
  const parser = parse({
    bom: true,
    columns: (columns: string[]) => {
      headerRead = true;
      return validateHeaders(sport, columns);
    },
    info: true,
    skip_empty_lines: true,
    max_record_size: 64 * 1024,
  });
  const digest = expectedHash ? createHash("sha256") : undefined;
  const source = createReadStream(path);
  source.on("error", (error) => parser.destroy(error));
  if (digest) source.on("data", (bytes) => digest.update(bytes));
  source.pipe(parser);

  try {
    for await (const { record, info } of parser as AsyncIterable<{ record: RawRow; info: { lines: number } }>) {
      summary.sourceRows++;
      let normalized: HistoricalRow;
      try {
        normalized = normalizeHistoricalRow(sport, record, info.lines);
      } catch (error) {
        if (!(error instanceof InvalidHistoricalRow)) throw error;
        rejectRow(summary, info.lines, error.message);
        continue;
      }

      summary.validRows++;
      const entry = summary.seasons[normalized.season.label] ??= { coverage: normalized.season.coverage, validRows: 0 };
      entry.validRows++;
      if (!normalized.observedPositions.length) summary.rowsWithoutPosition++;
      if (!normalized.game.gameDate) summary.rowsWithoutGameDate++;
      for (const [key, value] of Object.entries(normalized.stats)) {
        if (value !== null) continue;
        const category = `${normalized.role}:${key}`;
        summary.missingStats[category] = (summary.missingStats[category] ?? 0) + 1;
      }

      yield normalized;
    }
    if (!headerRead || summary.sourceRows === 0) throw new Error("CSV needs a header and at least one data row.");
    if (digest && digest.digest("hex") !== expectedHash) throw new Error("CSV changed during import. Retry with a stable file.");
  } finally {
    parser.destroy();
    source.destroy();
  }
}

export async function validateHistoricalCsv(path: string, sport: Sport) {
  const summary = newSummary();
  for await (const row of readHistoricalCsv(path, sport, summary)) {
    // Fully consume the stream so every row is validated.
    void row;
  }
  return summary;
}
