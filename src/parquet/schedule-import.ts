import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet";
import { z } from "zod";
import { Prisma, type GamePhase, type Sport } from "@/generated/prisma/client";
import { hashFile } from "@/imports/csv";
import { getDatabase } from "@/lib/db";

const sport = z.enum(["NFL", "MLB", "NBA", "NHL"]);
const required = {
  schedules: ["sport", "season", "game_id", "game_key", "game_type", "game_date", "start_time_utc", "home_team", "away_team", "home_team_id", "away_team_id", "status", "source", "retrieved_at_utc"],
  calendars: ["sport", "season", "first_game_date", "last_game_date", "first_known_start_utc", "last_known_start_utc", "observed_games", "missing_start_times", "verified_complete"],
  crosswalks: ["sport", "archive_game_id", "game_id", "game_key"],
  teams: ["sport", "season", "team_id", "team_name"],
} as const;

type Row = Record<string, unknown>;
type Files = { schedules: string; calendars: string; crosswalks: string; teams: string; validation: string };

const text = (value: unknown) => value == null ? "" : String(value);
const integer = (value: unknown) => Number(typeof value === "bigint" ? value : text(value));
const instant = (value: unknown) => value instanceof Date ? value : value == null || value === "" ? null : new Date(text(value));
const date = (value: unknown) => new Date(`${text(value)}T00:00:00.000Z`);
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item instanceof Date ? item.toISOString() : item)) as Prisma.InputJsonValue;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(json(value))).digest("hex");
const chunks = <T>(rows: T[], size = 2_000) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const seasonLabel = (value: Sport, year: number) => value === "NBA" || value === "NHL" ? `${year}-${String(year + 1).slice(-2)}` : String(year);
const teamExternalId = (row: Row, side?: "home" | "away") => text(row[side ? `${side}_team_id` : "team_id"]) || text(row[side ? `${side}_team` : "team_name"]);
const phase = (value: unknown): GamePhase => ({ regular: "REGULAR", postseason: "POSTSEASON", playoff: "POSTSEASON", preseason: "PRESEASON" }[text(value).toLowerCase()] as GamePhase | undefined) ?? "UNKNOWN";

async function read(path: string, columns: readonly string[]) {
  const file = await asyncBufferFromFile(path); const metadata = await parquetMetadataAsync(file);
  const actual = parquetSchema(metadata).children.map(({ element }) => element.name);
  const missing = columns.filter((column) => !actual.includes(column));
  if (missing.length) throw new Error(`${basename(path)} is missing columns: ${missing.join(", ")}.`);
  return { rows: await parquetReadObjects({ file }), count: Number(metadata.num_rows), columns: actual };
}

export async function validateScheduleBundle(files: Files) {
  const [schedules, calendars, crosswalks, teams] = await Promise.all([
    read(files.schedules, required.schedules), read(files.calendars, required.calendars), read(files.crosswalks, required.crosswalks), read(files.teams, required.teams),
  ]);
  const validation = JSON.parse(await (await import("node:fs/promises")).readFile(files.validation, "utf8")) as Record<string, unknown>;
  if (schedules.count !== 57_352 || crosswalks.count !== 52_862) throw new Error(`Unexpected V5 row counts: schedules=${schedules.count}, crosswalks=${crosswalks.count}.`);
  const scheduleKeys = new Set<string>(); const scheduleIds = new Set<string>(); const missingStarts: Row[] = [];
  for (const row of schedules.rows) {
    const value = sport.parse(row.sport); const key = text(row.game_key); const id = `${value}:${text(row.game_id)}`;
    if (!key || key !== id || scheduleKeys.has(key)) throw new Error(`Duplicate or inconsistent schedule identity ${key || id}.`);
    scheduleKeys.add(key); scheduleIds.add(id); if (!instant(row.start_time_utc)) missingStarts.push(row);
  }
  const archiveIds = new Set<string>();
  for (const row of crosswalks.rows) {
    const value = sport.parse(row.sport); const archive = `${value}:${text(row.archive_game_id)}`; const scheduled = `${value}:${text(row.game_id)}`;
    if (archiveIds.has(archive) || !scheduleIds.has(scheduled) || text(row.game_key) !== scheduled) throw new Error(`Invalid crosswalk ${archive}.`);
    archiveIds.add(archive);
  }
  if (missingStarts.length !== 5 || missingStarts.some((row) => row.sport !== "NBA" || integer(row.season) !== 2026 || text(row.status) !== "Scheduled")) throw new Error("V5 future NBA placeholder validation failed.");
  const unresolved = Array.isArray(validation.v5_unresolved) ? validation.v5_unresolved as Row[] : [];
  if (unresolved.length !== 4 || unresolved.some((row) => archiveIds.has(`NBA:${text(row.archive_game_id)}`))) throw new Error("The accepted four-game NBA unresolved set changed.");
  if (validation.verified_complete !== false) throw new Error("Observed V5 season boundaries must not be marked independently verified.");
  const hashes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await hashFile(path)])));
  return { schedules, calendars, crosswalks, teams, validation, hashes, bundleHash: digest(hashes), missingStarts, unresolved };
}

export async function importScheduleBundle(files: Files) {
  const source = await validateScheduleBundle(files); const database = getDatabase();
  const existing = await database.scheduleImportBatch.findUnique({ where: { bundleHash: source.bundleHash } });
  if (existing?.status === "COMPLETE") return { idempotent: true, ...existing };
  return database.$transaction(async (tx) => {
    const batch = await tx.scheduleImportBatch.create({ data: { importerVersion: "schedule-v5-1", bundleHash: source.bundleHash, status: "RUNNING",
      sourceManifest: json(Object.fromEntries(Object.entries(files).map(([key, path]) => [key, { file: basename(path), sha256: source.hashes[key as keyof typeof source.hashes] }]))) } });
    const seasonMap = new Map<string, { id: string }>();
    for (const row of source.calendars.rows) {
      const value = sport.parse(row.sport); const year = integer(row.season); const key = `${value}:${year}`;
      const season = await tx.season.upsert({ where: { sport_startYear: { sport: value, startYear: year } }, update: {}, create: { sport: value, startYear: year,
        label: seasonLabel(value, year), coverageReason: "V5 observed schedule boundary; completeness is not independently verified." } }); seasonMap.set(key, season);
      const record = json(row); const first = instant(row.first_known_start_utc); const last = instant(row.last_known_start_utc);
      await tx.seasonCalendarObservation.create({ data: { importBatchId: batch.id, seasonId: season.id, firstGameDate: date(row.first_game_date), lastGameDate: date(row.last_game_date),
        firstKnownStartAt: first, lastKnownStartAt: last, observedGames: integer(row.observed_games), missingStartTimes: integer(row.missing_start_times), independentlyVerified: false, sourceRecord: record } });
      await tx.professionalSeasonScheduleRevision.create({ data: { seasonId: season.id, status: "INCOMPLETE", provider: "schedule-v5", sourceName: "season_calendar.parquet",
        sourceVersion: "v5", contentHash: digest(row), retrievedAt: new Date(text((source.validation as { generated_at?: string }).generated_at ?? "2026-11-24T23:52:40.465Z")),
        regularSeasonStartsAt: first, regularSeasonEndsAt: last, reason: "Observed first/last regular-season games; boundary completeness is not independently verified.", sourceRecord: record } });
    }
    for (const row of source.teams.rows) {
      const value = sport.parse(row.sport); const year = integer(row.season); const externalId = teamExternalId(row); if (!externalId) throw new Error(`Missing ${value} team identity.`);
      const team = await tx.proTeam.upsert({ where: { sport_provider_externalId: { sport: value, provider: "schedule-v5", externalId } }, update: {},
        create: { sport: value, provider: "schedule-v5", externalId, code: text(row.team_name).slice(0, 12), displayName: text(row.team_name) } });
      const season = seasonMap.get(`${value}:${year}`) ?? await tx.season.upsert({ where: { sport_startYear: { sport: value, startYear: year } }, update: {},
        create: { sport: value, startYear: year, label: seasonLabel(value, year), coverageReason: "V5 team observation only." } });
      await tx.proTeamSeasonObservation.create({ data: { importBatchId: batch.id, seasonId: season.id, teamId: team.id, sourceTeamId: externalId, sourceTeamName: text(row.team_name) } });
    }
    const crosswalkBySchedule = new Map<string, Row>();
    for (const row of source.crosswalks.rows) crosswalkBySchedule.set(`${row.sport}:${text(row.game_id)}`, row);
    const archiveIdsBySport = new Map<Sport, string[]>();
    for (const row of source.crosswalks.rows) { const value = sport.parse(row.sport); archiveIdsBySport.set(value, [...(archiveIdsBySport.get(value) ?? []), text(row.archive_game_id)]); }
    const archiveGames = new Map<string, { id: string }>();
    for (const [value, ids] of archiveIdsBySport) for (const group of chunks([...new Set(ids)])) {
      const rows = await tx.game.findMany({ where: { sport: value, externalId: { in: group } }, select: { id: true, externalId: true } });
      const grouped = new Map<string, typeof rows>(); for (const row of rows) grouped.set(row.externalId, [...(grouped.get(row.externalId) ?? []), row]);
      for (const [externalId, matches] of grouped) if (matches.length === 1) archiveGames.set(`${value}:${externalId}`, matches[0]);
    }
    const createGames = source.schedules.rows.filter((row) => {
      const crosswalk = crosswalkBySchedule.get(`${row.sport}:${text(row.game_id)}`); return !crosswalk || !archiveGames.has(`${row.sport}:${text(crosswalk.archive_game_id)}`);
    }).map((row) => ({ sport: sport.parse(row.sport), seasonId: seasonMap.get(`${row.sport}:${integer(row.season)}`)!.id, provider: "schedule-v5", externalId: text(row.game_id),
      phase: phase(row.game_type), gameDate: date(row.game_date), startsAt: instant(row.start_time_utc), week: row.week == null ? null : integer(row.week) }));
    for (const group of chunks(createGames)) await tx.game.createMany({ data: group, skipDuplicates: true });
    const scheduleGames = new Map<string, { id: string }>();
    for (const group of chunks(source.schedules.rows.map((row) => text(row.game_id)))) {
      for (const game of await tx.game.findMany({ where: { provider: "schedule-v5", externalId: { in: group } }, select: { id: true, sport: true, externalId: true } })) scheduleGames.set(`${game.sport}:${game.externalId}`, game);
    }
    const teamRows = await tx.proTeam.findMany({ where: { provider: "schedule-v5" }, select: { id: true, sport: true, externalId: true } });
    const teamMap = new Map(teamRows.map((team) => [`${team.sport}:${team.externalId}`, team.id]));
    const observations = []; const gameTeams = []; const enrichments: { id: string; startsAt: string | null; gameDate: string; week: number | null }[] = [];
    for (const row of source.schedules.rows) {
      const value = sport.parse(row.sport); const scheduleKey = `${value}:${text(row.game_id)}`; const crosswalk = crosswalkBySchedule.get(scheduleKey);
      const canonical = crosswalk ? archiveGames.get(`${value}:${text(crosswalk.archive_game_id)}`) ?? scheduleGames.get(scheduleKey) : scheduleGames.get(scheduleKey);
      if (!canonical) throw new Error(`No canonical game for ${scheduleKey}.`);
      const record = json(row); const startsAt = instant(row.start_time_utc);
      observations.push({ importBatchId: batch.id, gameId: canonical.id, sport: value, scheduleProvider: "schedule-v5", scheduleExternalId: text(row.game_id), gameKey: text(row.game_key),
        phase: phase(row.game_type), gameDate: date(row.game_date), startsAt, status: text(row.status), source: text(row.source), retrievedAt: instant(row.retrieved_at_utc)!, contentHash: digest(row), sourceRecord: record });
      enrichments.push({ id: canonical.id, startsAt: startsAt?.toISOString() ?? null, gameDate: text(row.game_date), week: row.week == null ? null : integer(row.week) });
      if (scheduleGames.get(scheduleKey)?.id === canonical.id) for (const side of ["home", "away"] as const) {
        const externalId = teamExternalId(row, side); const teamId = teamMap.get(`${value}:${externalId}`); if (teamId) gameTeams.push({ gameId: canonical.id, teamId, side: side === "home" ? "HOME" as const : "AWAY" as const });
      }
    }
    for (const group of chunks(observations)) await tx.gameScheduleObservation.createMany({ data: group, skipDuplicates: true });
    for (const group of chunks(gameTeams)) await tx.gameTeam.createMany({ data: group, skipDuplicates: true });
    for (const group of chunks(enrichments)) await tx.$executeRaw`UPDATE "Game" AS game SET
      "startsAt" = COALESCE(game."startsAt", source."startsAt"::timestamptz),
      "gameDate" = COALESCE(game."gameDate", source."gameDate"::date),
      "week" = COALESCE(game."week", source."week")
      FROM jsonb_to_recordset(${JSON.stringify(group)}::jsonb) AS source("id" text, "startsAt" text, "gameDate" text, "week" integer)
      WHERE game."id" = source."id"::uuid`;
    const crosswalkRecords = source.crosswalks.rows.map((row) => { const value = sport.parse(row.sport); const scheduleKey = `${value}:${text(row.game_id)}`;
      return { importBatchId: batch.id, sport: value, archiveGameId: text(row.archive_game_id), scheduleExternalId: text(row.game_id), gameKey: text(row.game_key),
        canonicalGameId: archiveGames.get(`${value}:${text(row.archive_game_id)}`)?.id ?? scheduleGames.get(scheduleKey)?.id, status: "MATCHED" as const };
    });
    for (const group of chunks(crosswalkRecords)) await tx.historicalGameCrosswalk.createMany({ data: group });
    for (const row of source.unresolved) await tx.historicalGameCrosswalk.create({ data: { importBatchId: batch.id, sport: "NBA", archiveGameId: text(row.archive_game_id),
      status: "UNRESOLVED", reason: text(row.reason) } });
    await tx.scheduleImportIssue.createMany({ data: [
      ...source.unresolved.map((row) => ({ importBatchId: batch.id, sport: "NBA" as const, code: "UNMATCHED_ARCHIVE_GAME", externalId: text(row.archive_game_id), reason: text(row.reason), details: json(row) })),
      ...source.missingStarts.map((row) => ({ importBatchId: batch.id, sport: "NBA" as const, code: "PENDING_FUTURE_START", externalId: text(row.game_id), reason: "Future NBA placeholder has no published UTC start.", details: json(row) })),
    ] });
    return tx.scheduleImportBatch.update({ where: { id: batch.id }, data: { status: "COMPLETE", completedAt: new Date(), scheduleRows: source.schedules.count,
      calendarRows: source.calendars.count, teamRows: source.teams.count, crosswalkRows: source.crosswalks.count, unresolvedRows: source.unresolved.length, missingStartRows: source.missingStarts.length } });
  }, { isolationLevel: "Serializable", timeout: 300_000, maxWait: 30_000 }).then((batch) => ({ idempotent: false, ...batch }));
}

export function scheduleBundleFiles(directory: string): Files {
  return { schedules: join(directory, "game_schedules.parquet"), calendars: join(directory, "season_calendar.parquet"),
    crosswalks: join(directory, "game_id_crosswalk.parquet"), teams: join(directory, "team_master.parquet"), validation: join(directory, "schedule_validation.json") };
}
