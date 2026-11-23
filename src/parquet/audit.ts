import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet";
import type { SeasonCoverage, Sport } from "@/generated/prisma/enums";
import { InvalidHistoricalRow, normalizeHistoricalRow, type RawRow } from "@/imports/normalize";
import { ubpV9Rules } from "@/scoring/ubp-v9";
import { historicalEvidence } from "./evidence";
import { parquetSources, priorValidatedRows, startYear } from "./config";
import type { ParquetQualityReport } from "./types";

const scoringColumns = Object.fromEntries((["NFL", "MLB", "NBA", "NHL"] as Sport[]).map((sport) => [sport,
  [...new Set(ubpV9Rules.filter((rule) => rule.sport === sport).map(({ statKey }) => statKey))],
])) as Record<Sport, string[]>;

async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function rawRow(row: Record<string, unknown>): RawRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)],
  ));
}

function reason(error: unknown) {
  return error instanceof Error ? error.message : "Unknown row validation error.";
}

function coverageFor(sport: Sport, year: number, games: number): { coverage: SeasonCoverage; reason: string } {
  if (year >= 2026) return { coverage: "PARTIAL", reason: "The file ends during or after the 2026 season boundary and is excluded by the frozen V9 evaluation rules." };
  if ((sport === "MLB" && year === 2020) || ((sport === "NBA" || sport === "NHL") && (year === 2019 || year === 2020))) {
    return { coverage: "QUARANTINED", reason: "COVID-disrupted schedule is kept separate from consistent-rule comparisons." };
  }
  const expected = sport === "NFL" ? (year >= 2021 ? 272 : 256)
    : sport === "NBA" ? 1230
      : sport === "NHL" ? (year >= 2021 ? 1312 : year >= 2017 ? 1271 : 1230)
        : 2430;
  const plausible = sport === "MLB" ? Math.abs(games - expected) <= 2 : games === expected;
  return plausible
    ? { coverage: "UNVERIFIED", reason: `Observed ${games} regular-season fixtures, consistent with the reconstructed schedule. Independent fixture evidence is still required for VERIFIED classification.` }
    : { coverage: "PARTIAL", reason: `Observed ${games} fixtures versus reconstructed expectation ${expected}.` };
}

type MutableSeason = {
  label: string; rows: number; acceptedRows: number; quarantinedRows: number; duplicateRows: number;
  games: Set<string>; players: Set<string>; teams: Set<string>; min: string | null; max: string | null;
  missing: Record<string, number>; reasons: Record<string, number>; identities: Set<string>;
};

export async function auditParquet(options: {
  path: string; sport: Sport; batchSize?: number; postgresActiveStats?: number | null; generatedAt?: Date;
}): Promise<ParquetQualityReport> {
  const batchSize = options.batchSize ?? 25_000;
  if (!Number.isInteger(batchSize) || batchSize < 100 || batchSize > 100_000) throw new Error("Parquet batch size must be between 100 and 100000 rows.");
  const config = parquetSources[options.sport];
  const file = await asyncBufferFromFile(options.path);
  const metadata = await parquetMetadataAsync(file);
  const schema = parquetSchema(metadata);
  const names = new Set(schema.children.map(({ element }) => element.name));
  const missingColumns = config.requiredColumns.filter((column) => !names.has(column));
  if (missingColumns.length) throw new Error(`Missing ${options.sport} Parquet columns: ${missingColumns.join(", ")}.`);
  const seasons = new Map<number, MutableSeason>();
  const quarantine: ParquetQualityReport["quarantine"] = [];
  const rowCount = Number(metadata.num_rows);
  const projected = [...new Set([...config.requiredColumns, ...scoringColumns[options.sport],
    "outs", "inningsPitched", "strikeOuts", "hitBatsmen", "decision", "starter", "toi",
    "player_name", "position", "game_date", "category", "team_id", "team_name",
    "SEASON_YEAR", "GAME_ID", "GAME_DATE", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "MATCHUP",
  ].filter((column) => names.has(column)))];

  for (let rowStart = 0; rowStart < rowCount; rowStart += batchSize) {
    const rows = await parquetReadObjects({ file, columns: projected, rowStart, rowEnd: Math.min(rowCount, rowStart + batchSize) });
    for (let index = 0; index < rows.length; index++) {
      const physicalRow = rowStart + index + 1;
      const source = rawRow(rows[index]);
      const year = startYear(source[config.seasonColumn]);
      if (year == null) {
        const message = "Invalid or missing season.";
        quarantine.push({ row: physicalRow, season: null, reason: message });
        continue;
      }
      let season = seasons.get(year);
      if (!season) {
        season = { label: source[config.seasonColumn], rows: 0, acceptedRows: 0, quarantinedRows: 0, duplicateRows: 0,
          games: new Set(), players: new Set(), teams: new Set(), min: null, max: null,
          missing: {}, reasons: {}, identities: new Set() };
        seasons.set(year, season);
      }
      season.rows++;
      try {
        const normalized = normalizeHistoricalRow(options.sport, source, physicalRow);
        const identity = `${normalized.game.externalId}:${normalized.player.externalId}:${normalized.role}`;
        if (season.identities.has(identity)) {
          season.duplicateRows++;
          season.quarantinedRows++;
          season.reasons["Duplicate game, player, and scoring role."] = (season.reasons["Duplicate game, player, and scoring role."] ?? 0) + 1;
          quarantine.push({ row: physicalRow, season: year, reason: "Duplicate game, player, and scoring role." });
          continue;
        }
        season.identities.add(identity);
        season.acceptedRows++;
        season.games.add(normalized.game.externalId);
        season.players.add(normalized.player.externalId);
        season.teams.add(normalized.team.externalId);
        const date = normalized.game.gameDate?.toISOString().slice(0, 10) ?? null;
        if (date) {
          season.min = !season.min || date < season.min ? date : season.min;
          season.max = !season.max || date > season.max ? date : season.max;
        }
        for (const [key, value] of Object.entries(normalized.stats)) if (value == null) season.missing[key] = (season.missing[key] ?? 0) + 1;
      } catch (error) {
        const message = reason(error);
        if (!(error instanceof InvalidHistoricalRow)) throw error;
        season.quarantinedRows++;
        season.reasons[message] = (season.reasons[message] ?? 0) + 1;
        quarantine.push({ row: physicalRow, season: year, reason: message });
      }
    }
  }

  const sourceStat = await stat(options.path);
  const seasonReports = [...seasons.entries()].sort(([a], [b]) => a - b).map(([year, season]) => {
    const classification = coverageFor(options.sport, year, season.games.size);
    return {
      sport: options.sport, season: year, label: season.label, rows: season.rows,
      acceptedRows: season.acceptedRows, quarantinedRows: season.quarantinedRows,
      duplicateRows: season.duplicateRows, games: season.games.size, players: season.players.size,
      teams: season.teams.size, minimumDate: season.min, maximumDate: season.max,
      coverage: classification.coverage, coverageReason: classification.reason,
      missingStatistics: Object.fromEntries(Object.entries(season.missing).sort()),
      quarantineReasons: Object.fromEntries(Object.entries(season.reasons).sort()),
      evidence: historicalEvidence(options.sport, season.acceptedRows),
    };
  });
  const acceptedRows = seasonReports.reduce((sum, season) => sum + season.acceptedRows, 0);
  const quarantinedRows = seasonReports.reduce((sum, season) => sum + season.quarantinedRows, 0) + quarantine.filter(({ season }) => season == null).length;
  const duplicateRows = seasonReports.reduce((sum, season) => sum + season.duplicateRows, 0);
  const prior = priorValidatedRows[options.sport] ?? null;
  return {
    reportVersion: "parquet-quality-1",
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    sport: options.sport,
    source: {
      path: basename(options.path), bytes: sourceStat.size, sha256: await sha256(options.path), parquetRows: rowCount,
      rowGroups: metadata.row_groups.length,
      columns: schema.children.map(({ element }) => ({ name: element.name, type: JSON.stringify(element.type ?? element.converted_type ?? "group") })),
      keyValueMetadata: Object.fromEntries((metadata.key_value_metadata ?? []).map(({ key, value }) => [key, value ?? ""])),
    },
    processing: { batchSize, peakRowsHeld: Math.min(batchSize, rowCount) },
    totals: { rows: rowCount, acceptedRows, quarantinedRows, duplicateRows },
    seasons: seasonReports,
    quarantine,
    reconciliation: {
      priorValidatedRows: prior, rowCountMatchesPriorArchive: prior == null ? null : rowCount === prior,
      postgresActiveStats: options.postgresActiveStats ?? null,
      note: "Matching archive row counts do not prove that rows were imported into PostgreSQL. Compare the fingerprint and canonical identities before importing.",
    },
  };
}
