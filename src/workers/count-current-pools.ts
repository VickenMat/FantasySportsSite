import { join, resolve } from "node:path";
import { Sport } from "@/generated/prisma/enums";
import { newSummary } from "@/imports/csv";
import { parquetSources } from "@/parquet/config";
import { readHistoricalParquet } from "@/parquet/read";

const directory = resolve(process.argv[2] ?? "Datasets");
const result: Record<string, { season: string; distinctPlayers: number; validRows: number; rejectedRows: number }> = {};
for (const sport of Object.values(Sport)) {
  const summary = newSummary(); const players = new Set<string>(); let label = "";
  for await (const row of readHistoricalParquet({ path: join(directory, parquetSources[sport].filename), sport, summary })) {
    if (row.season.startYear !== 2026) continue;
    label = row.season.label; players.add(row.player.externalId);
  }
  result[sport] = { season: label || (sport === "NBA" || sport === "NHL" ? "2026-27" : "2026"), distinctPlayers: players.size, validRows: summary.validRows, rejectedRows: summary.rejectedRows };
}
console.log(JSON.stringify(result, null, 2));
