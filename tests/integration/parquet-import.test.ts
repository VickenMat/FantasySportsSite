import "dotenv/config";
import { randomInt } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parquetWriteFile } from "hyparquet-writer";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { importHistoricalParquet } from "@/parquet/persist";
import { validateHistoricalParquet } from "@/parquet/read";
import { nflRow } from "../helpers/historical-csv";

const database = getDatabase();
afterAll(() => database.$disconnect());

it("validates and idempotently imports a Parquet source without changing raw cells", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fantasy-parquet-"));
  const path = join(dir, "nfl.parquet");
  const playerId = `00-${randomInt(1_000_000, 9_999_999)}`;
  const row = { ...nflRow, season: "2097", game_id: "2097_01_BUF_BAL", player_id: playerId };
  try {
    parquetWriteFile({
      filename: path,
      columnData: Object.entries(row).map(([name, value]) => ({ name, data: [value, value], type: "STRING" as const })),
    });
    expect(await validateHistoricalParquet(path, "NFL", 100)).toMatchObject({ sourceRows: 2, validRows: 2, rejectedRows: 0 });
    const first = await importHistoricalParquet({ path, sport: "NFL", batchSize: 100 });
    expect(first).toMatchObject({ alreadyImported: false, summary: { insertedRows: 1, duplicateRows: 1 } });
    expect(await importHistoricalParquet({ path, sport: "NFL", batchSize: 100 })).toEqual({ ...first, alreadyImported: true });
    const external = await database.playerExternalId.findUniqueOrThrow({
      where: { sport_provider_externalId: { sport: "NFL", provider: "v9-historical", externalId: playerId } },
    });
    const stat = await database.playerGameStat.findFirstOrThrow({ where: { playerId: external.playerId } });
    expect(stat.raw).toMatchObject({ player_id: playerId, game_id: row.game_id, receptions: row.receptions });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("scopes Parquet imports to one season and transparently quarantines excluded games", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fantasy-parquet-season-"));
  const path = join(dir, "nfl-seasons.parquet");
  const playerId = `00-${randomInt(1_000_000, 9_999_999)}`;
  const rows = [
    { ...nflRow, season: "2095", game_id: "2095_01_BUF_BAL", player_id: playerId },
    { ...nflRow, season: "2096", game_id: "2096_01_BUF_BAL", player_id: playerId },
    { ...nflRow, season: "2096", week: "2", game_id: "2096_02_BUF_BAL", player_id: playerId },
  ];
  try {
    parquetWriteFile({
      filename: path,
      columnData: Object.keys(rows[0]).map((name) => ({
        name,
        data: rows.map((row) => String(row[name as keyof typeof row])),
        type: "STRING" as const,
      })),
    });
    const excludedGameIds = new Set(["2096_02_BUF_BAL"]);
    expect(await validateHistoricalParquet(path, "NFL", 100, 2096, excludedGameIds)).toMatchObject({
      sourceRows: 2,
      validRows: 1,
      rejectedRows: 1,
      sampleIssues: [{ message: "Quarantined conflicting game 2096_02_BUF_BAL." }],
    });
    const first = await importHistoricalParquet({
      path,
      sport: "NFL",
      batchSize: 100,
      seasonYear: 2096,
      excludedGameIds: [...excludedGameIds],
      allowRejected: true,
    });
    expect(first).toMatchObject({
      alreadyImported: false,
      summary: { sourceRows: 2, validRows: 1, rejectedRows: 1, insertedRows: 1 },
    });
    expect(await importHistoricalParquet({
      path,
      sport: "NFL",
      batchSize: 100,
      seasonYear: 2096,
      excludedGameIds: [...excludedGameIds],
      allowRejected: true,
    })).toEqual({ ...first, alreadyImported: true });
    const external = await database.playerExternalId.findUniqueOrThrow({
      where: { sport_provider_externalId: { sport: "NFL", provider: "v9-historical", externalId: playerId } },
    });
    const games = await database.playerGameStat.findMany({
      where: { playerId: external.playerId, game: { season: { startYear: { in: [2095, 2096] } } } },
      select: { game: { select: { externalId: true, season: { select: { startYear: true } } } } },
    });
    expect(games).toEqual([{ game: { externalId: "2096_01_BUF_BAL", season: { startYear: 2096 } } }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
