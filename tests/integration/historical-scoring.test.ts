import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import type { Sport } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { importHistoricalCsv } from "@/imports/persist";
import { historicalProvider } from "@/imports/normalize";
import { getEligiblePositions, recordPositionEvidence } from "@/server/positions";
import { getLeagueScoreHistory, recalculateScore } from "@/server/score-ledger";
import { mlbRow, nbaRow, nflRow, nhlRow, writeHistoricalCsv } from "../helpers/historical-csv";
import { playerStatistics } from "@/server/player-statistics";
import { ubpV9Rules } from "@/scoring/ubp-v9";

const db = getDatabase();
const numberId = () => String(randomInt(1_000_000_000, 2_000_000_000));
const nflId = () => `00-${randomInt(1_000_000, 9_999_999)}`;
let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "fantasy-db-import-")); });
afterEach(() => rm(dir, { recursive: true, force: true }));
afterAll(() => db.$disconnect());

async function athleteGame(sport: Sport, player: string, game: string) {
  const [athlete, fixture] = await Promise.all([
    db.playerExternalId.findUniqueOrThrow({
      where: { sport_provider_externalId: { sport, provider: historicalProvider, externalId: player } },
    }),
    db.game.findUniqueOrThrow({
      where: { sport_provider_externalId: { sport, provider: historicalProvider, externalId: game } },
      include: { season: true, teams: true },
    }),
  ]);
  return { playerId: athlete.playerId, gameId: fixture.id, fixture };
}

it("derives historical analytics idempotently from corrected box scores without creating competitive ledgers", async () => {
  const zeros = Object.fromEntries(ubpV9Rules.filter(({ sport }) => sport === "NBA").map(({ statKey }) => [statKey, "0"]));
  const row = { ...nbaRow, ...zeros, SEASON_YEAR: "2096-97", GAME_DATE: "2096-10-25", GAME_ID: `002${numberId()}`, PLAYER_ID: numberId(), PTS: "10" };
  const file = await writeHistoricalCsv(join(dir, "analytics.csv"), [row]);
  await importHistoricalCsv({ path: file, sport: "NBA" });
  const { playerId, fixture } = await athleteGame("NBA", row.PLAYER_ID, row.GAME_ID);
  const preset = await db.scoringPreset.findUniqueOrThrow({ where: { version: "ubp-v9-experimental" } });
  const input = { playerIds: [playerId], seasonId: fixture.seasonId, presetId: preset.id };
  const unit = ubpV9Rules.find(({ sport, statKey }) => sport === "NBA" && statKey === "PTS")!.coefficientTenths;
  expect((await playerStatistics(input)).get(playerId)?.totalTenths).toBe(BigInt(unit * 10));
  expect((await playerStatistics(input)).get(playerId)?.totalTenths).toBe(BigInt(unit * 10));
  const corrected = await writeHistoricalCsv(join(dir, "analytics-corrected.csv"), [{ ...row, PTS: "20" }]);
  await importHistoricalCsv({ path: corrected, sport: "NBA", correctionReason: "Synthetic analytics revision" });
  expect((await playerStatistics(input)).get(playerId)).toMatchObject({ gamesPlayed: 1, scoredGames: 1, totalTenths: BigInt(unit * 20) });
  expect(await db.scoreLedger.count({ where: { playerId } })).toBe(0);
});

it("imports all four sports, keeps source IDs intact, and deduplicates bytes and re-encoded rows", async () => {
  const nfl = { ...nflRow, player_id: nflId(), season: "2098", game_id: "2098_01_BUF_BAL" };
  await db.season.upsert({ where: { sport_startYear: { sport: "NFL", startYear: 2098 } }, create: { sport: "NFL", startYear: 2098, label: "2098", coverage: "UNVERIFIED" }, update: {} });
  const mlb = { ...mlbRow, game_id: numberId(), player_id: numberId() };
  const nba = { ...nbaRow, GAME_ID: `002${numberId()}`, PLAYER_ID: numberId() };
  const nhl = { ...nhlRow, game_id: `202502${numberId()}`, player_id: numberId() };
  const rows = { NFL: nfl, MLB: mlb, NBA: nba, NHL: nhl };

  for (const sport of Object.keys(rows) as Sport[]) {
    const row = rows[sport];
    const path = await writeHistoricalCsv(join(dir, `${sport}.csv`), [row, row]);
    const first = await importHistoricalCsv({ path, sport });
    expect(first).toMatchObject({ alreadyImported: false, summary: { insertedRows: 1, duplicateRows: 1 } });
    const same = await importHistoricalCsv({ path, sport });
    expect(same).toEqual({ ...first, alreadyImported: true });
    const reordered = await writeHistoricalCsv(join(dir, `${sport}-reordered.csv`), [row], Object.keys(row).reverse());
    const second = await importHistoricalCsv({ path: reordered, sport });
    expect(second.summary).toMatchObject({ insertedRows: 0, duplicateRows: 1, revisedRows: 0 });
  }

  const nflFixture = (await athleteGame("NFL", nfl.player_id, nfl.game_id)).fixture;
  expect(nflFixture).toMatchObject({ gameDate: null, startsAt: null, season: { coverage: "PARTIAL" } });
  expect(nflFixture.teams.map(({ side }) => side).sort()).toEqual(["AWAY", "HOME"]);
  const nbaFixture = (await athleteGame("NBA", nba.PLAYER_ID, nba.GAME_ID)).fixture;
  expect(nbaFixture.externalId.startsWith("002")).toBe(true);
  expect(nbaFixture.startsAt).toBeNull();
});

it("rolls back a rejected file by default and applies an explicit accepted-row import", async () => {
  const row = { ...nbaRow, GAME_ID: `002${numberId()}` };
  // Fill one database batch before encountering a bad source row.
  const rows = Array.from({ length: 300 }, () => ({ ...row, PLAYER_ID: numberId() }));
  const file = await writeHistoricalCsv(join(dir, "mixed.csv"), [...rows, { ...row, BLK: "-5" }]);
  await expect(importHistoricalCsv({ path: file, sport: "NBA" })).rejects.toThrow(/no changes were applied/);
  expect(await db.game.findFirst({ where: { sport: "NBA", externalId: row.GAME_ID } })).toBeNull();
  const accepted = await importHistoricalCsv({ path: file, sport: "NBA", allowRejected: true });
  expect(accepted.summary).toMatchObject({ sourceRows: 301, rejectedRows: 1, insertedRows: 300 });
});

it("keeps duplicate CSVs and concurrent replays idempotent and appends score history for corrections", async () => {
  const row = { ...nflRow, player_id: nflId(), season: "2098", game_id: "2098_01_BUF_BAL" };
  const first = await writeHistoricalCsv(join(dir, "original.csv"), [row]);
  const [a, b] = await Promise.all([importHistoricalCsv({ path: first, sport: "NFL" }), importHistoricalCsv({ path: first, sport: "NFL" })]);
  expect([a.alreadyImported, b.alreadyImported].sort()).toEqual([false, true]);

  const { gameId, playerId } = await athleteGame("NFL", row.player_id, row.game_id);
  const options = { gameId, playerId, reason: "integration first calculation" };
  const concurrent = await Promise.all([recalculateScore(options), recalculateScore(options)]);
  expect(concurrent.map(({ changed }) => changed).sort()).toEqual([false, true]);
  const original = concurrent[0].entry;
  expect(original).toMatchObject({ sequence: 1, totalTenths: BigInt(68), teEligible: true });

  const changed = { ...row, receiving_yards: "20", receptions: "3" };
  const correction = await writeHistoricalCsv(join(dir, "corrected.csv"), [changed]);
  await expect(importHistoricalCsv({ path: correction, sport: "NFL" })).rejects.toThrow(/correction-reason/);
  const stored = await importHistoricalCsv({ path: correction, sport: "NFL", correctionReason: "Provider changed credited catches" });
  expect(stored.summary).toMatchObject({ revisedRows: 1, insertedRows: 0 });
  expect((await importHistoricalCsv({ path: correction, sport: "NFL" })).alreadyImported).toBe(true);

  const rows = await db.playerGameStat.findMany({ where: { gameId, playerId }, orderBy: { revision: "asc" } });
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ raw: { receptions: "2" }, sourceKnownAt: null, priorRevisionId: null });
  expect(rows[1]).toMatchObject({ raw: { receptions: "3" }, priorRevisionId: rows[0].id, revision: 2 });
  await expect(db.playerGameStat.update({ where: { id: rows[0].id }, data: { raw: {} } })).rejects.toThrow(/append-only/);
  await expect(db.playerGameStat.delete({ where: { id: rows[1].id } })).rejects.toThrow(/append-only/);

  const replay = await recalculateScore({ ...options, reason: "unchanged inputs" });
  expect(replay.changed).toBe(false);
  expect(replay.entry).toMatchObject({
    previousEntryId: original.id, sequence: 2, statId: rows[1].id, totalTenths: BigInt(137),
    reason: "Provider changed credited catches", ruleHash: original.ruleHash,
  });
  await expect(db.scoreLedgerEntry.update({ where: { id: original.id }, data: { reason: "overwrite" } })).rejects.toThrow(/append-only/);

  const league = await db.league.findUniqueOrThrow({
    where: { slug: "founders-dynasty" },
    include: { members: { select: { userId: true }, take: 1 } },
  });
  const query = { leagueId: league.id, playerId, gameId, skip: 0, take: 10 };
  expect(await getLeagueScoreHistory({ ...query, userId: randomUUID() })).toBeNull();
  const history = await getLeagueScoreHistory({ ...query, userId: league.members[0].userId });
  expect(history).toMatchObject({
    nextOffset: null,
    items: [{ role: "FOOTBALL", entries: [{ totalPoints: "13.7", stat: { revision: 2 } }, { totalPoints: "6.8" }] }],
  });
});

it("preserves one MLB athlete for two box scores and locks one role per scoring preset", async () => {
  const row = { ...mlbRow, game_id: numberId(), player_id: numberId() };
  const pitcher = { ...row, category: "pitching", hits: "2", inningsPitched: "5.2", outs: "17", homeRuns: "0" };
  const file = await writeHistoricalCsv(join(dir, "two-way.csv"), [row, pitcher]);
  await importHistoricalCsv({ path: file, sport: "MLB" });
  const { gameId, playerId } = await athleteGame("MLB", row.player_id, row.game_id);
  const options = { gameId, playerId, reason: "selected pitching role" };

  expect(await db.playerGameStat.count({ where: { gameId, playerId } })).toBe(2);
  await expect(recalculateScore(options)).rejects.toThrow(/choose a scoring role/i);
  const score = await recalculateScore({ ...options, role: "PITCHER" });
  expect(score.entry.totalTenths).toBe(BigInt(463));
  await expect(recalculateScore({ ...options, role: "HITTER" })).rejects.toThrow(/already fixed/);
  expect(await db.scoreLedger.count({ where: { gameId, playerId } })).toBe(1);
});

it("uses trusted as-of evidence for MLB eligibility instead of retrospective CSV positions", async () => {
  const player = numberId();
  const rows = Array.from({ length: 10 }, () => ({ ...mlbRow, player_id: player, game_id: numberId() }));
  const path = await writeHistoricalCsv(join(dir, "appearances.csv"), rows);
  await importHistoricalCsv({ path, sport: "MLB" });
  const games = await Promise.all(rows.map(({ game_id }) => athleteGame("MLB", player, game_id)));
  const { playerId, fixture } = games[0];
  const effectiveAt = new Date("2025-04-05T21:00:00Z");
  const knownAt = new Date("2025-04-06T01:00:00Z");
  const query = { playerId, sport: "MLB" as const, seasonYear: 2025, asOf: knownAt };
  expect(await getEligiblePositions(query)).toMatchObject({ available: false, positions: [] });

  const ids = games.map(({ gameId }) => gameId);
  for (const gameId of ids) {
    const report = {
      kind: "FIELDING" as const, playerId, seasonId: fixture.seasonId, gameId, code: "RF", started: true,
      effectiveAt, knownAt, provider: "integration-fielding", externalId: randomUUID(),
    };
    const evidence = await recordPositionEvidence(report);
    expect((await recordPositionEvidence(report)).id).toBe(evidence.id);
  }
  expect(await getEligiblePositions({ ...query, asOf: effectiveAt })).toMatchObject({ available: false, positions: [] });
  expect(await getEligiblePositions(query)).toMatchObject({ available: true, positions: ["RF"] });
  expect(await getEligiblePositions({ ...query, seasonYear: 2026 })).toMatchObject({ positions: ["RF"] });
  expect(await getEligiblePositions({ ...query, seasonYear: 2027 })).toMatchObject({ positions: [] });
});
