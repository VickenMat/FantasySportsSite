import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { SeasonCoverage, Sport } from "@/generated/prisma/enums";
import { hashFile, newSummary, readHistoricalCsv } from "@/imports/csv";
import type { HistoricalRow } from "@/imports/normalize";
import { calculateScore } from "@/scoring/engine";
import { ubpV9Rules } from "@/scoring/ubp-v9";
import { compareId, day } from "./config";
import type { Fixture, Outcome, SimulationInput } from "./types";

const historicalAssumptions = [
  "Fixture schedule uses archived observed dates or the supplied NFL schedule and assumes publication before the draft.",
  "Box scores and roster observations become available two UTC calendar days after the game date.",
  "Prospective team and active status use last published appearances, so trades, rookie availability and injuries are incomplete.",
  "MLB and NBA position enrichment uses prior-season lists only, while NFL and NHL use last published observed position.",
  "MLB starting pitchers and NHL goalies use an uncertain history-based model in the absence of pregame reports.",
  "Coverage is diagnostic. Historical publication times and verified fixtures are required for an as-of comparison.",
];

type ScheduleRow = { game_id: string; gameday: string; gametime: string; game_type: string };
type Schedule = { date: string; startsAt: number };
type HistoricalSeason = {
  label: string;
  year: number;
  coverage: SeasonCoverage;
  coverageReason: string;
  fixtures: Map<string, { id: string; slate: string; startsAt: number; teams: Set<string> }>;
  outcomes: Outcome[];
  acceptedRows: number;
  unscheduledRows: number;
};

const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" });
function easternKickoff(date: string, time: string) {
  const wallTime = Date.parse(`${date}T${time}:00Z`);
  const offset = offsetFormatter.formatToParts(wallTime).find(({ type }) => type === "timeZoneName")?.value.match(/GMT(-\d{2}):(\d{2})/);
  if (!offset) throw new Error("NFL kickoff did not resolve to an Eastern time offset.");
  return wallTime - Number(offset[1]) * 3_600_000 + Number(offset[2]) * 60_000;
}

function normalizedNflGameId(gameId: string) {
  const aliases: Record<string, string> = { OAK: "LV", SD: "LAC" };
  return gameId.split("_").map((part) => aliases[part] ?? part).join("_");
}

async function readNflSchedule(path: string) {
  const rows = parse(await readFile(path), { columns: true, bom: true, skip_empty_lines: true }) as ScheduleRow[];
  const map = new Map<string, Schedule>();
  for (const row of rows) {
    const time = row.gametime;
    if (row.game_type !== "REG" || !/^\d{4}-\d{2}-\d{2}$/.test(row.gameday) || !/^\d{2}:\d{2}$/.test(time)) continue;
    const startsAt = easternKickoff(row.gameday, time);
    if (!Number.isFinite(startsAt)) continue;
    map.set(normalizedNflGameId(row.game_id), { date: row.gameday, startsAt });
  }
  if (!map.size) throw new Error("The NFL schedule contains no regular-season games with kickoff times.");
  return map;
}

function isCandidate(row: HistoricalRow, sport: Sport) {
  if (sport === "NFL") return row.observedPositions.some((position) => ["QB", "RB", "FB", "WR", "TE"].includes(position));
  return true;
}

export async function historicalSeasons(options: { csv: string; nflSchedule?: string; sport: Sport }) {
  const { csv, nflSchedule, sport } = options;
  if (sport === "NFL" && !nflSchedule) throw new Error("NFL source rows need --nfl-schedule because they have no game dates.");
  const hashes: Record<string, string> = { csv: await hashFile(csv) };
  const schedule = nflSchedule ? await readNflSchedule(nflSchedule) : new Map<string, Schedule>();
  if (nflSchedule) hashes.nflSchedule = await hashFile(nflSchedule);
  const summary = newSummary();
  const seasons = new Map<number, HistoricalSeason>();
  const observedRows = new Set<string>();
  const quarantinedRows: { line: number; message: string }[] = [];
  let duplicateRows = 0;
  let excludedPhaseRows = 0;
  let nonFantasyRows = 0;
  for await (const row of readHistoricalCsv(csv, sport, summary, hashes.csv, (issue) => quarantinedRows.push(issue))) {
    const season = row.season;
    let target = seasons.get(season.startYear);
    if (!target) {
      target = {
        label: season.label, year: season.startYear, coverage: season.coverage, coverageReason: season.coverageReason ?? "",
        fixtures: new Map(), outcomes: [], acceptedRows: 0, unscheduledRows: 0,
      };
      seasons.set(season.startYear, target);
    }
    target.acceptedRows++;
    if (row.game.phase !== "REGULAR" && row.game.phase !== "UNKNOWN") {
      excludedPhaseRows++;
      continue;
    }
    const kickoff = sport === "NFL" ? schedule.get(normalizedNflGameId(row.game.externalId)) : undefined;
    const date = kickoff?.date ?? row.game.gameDate?.toISOString().slice(0, 10);
    if (!date) {
      target.unscheduledRows++;
      continue;
    }
    const startOfDate = Date.parse(`${date}T00:00:00Z`);
    const startsAt = kickoff?.startsAt ?? startOfDate;
    let fixture = target.fixtures.get(row.game.externalId);
    if (!fixture) {
      fixture = {
        id: row.game.externalId, slate: sport === "NFL" ? `week-${row.game.week}` : date, startsAt, teams: new Set(),
      };
      target.fixtures.set(fixture.id, fixture);
    }
    fixture.teams.add(row.team.externalId);
    if (row.opponent) fixture.teams.add(row.opponent.externalId);
    if (!isCandidate(row, sport)) {
      nonFantasyRows++;
      continue;
    }
    const rowKey = `${fixture.id}:${row.player.externalId}:${row.role}`;
    if (observedRows.has(rowKey)) {
      duplicateRows++;
      continue;
    }
    observedRows.add(rowKey);
    const result = calculateScore(ubpV9Rules, {
      role: row.role, stats: row.stats,
      teEligible: sport === "NFL" && row.observedPositions.length > 0 ? row.observedPositions.includes("TE") : null,
    });
    const started = row.role === "PITCHER" && row.raw.gamesStarted ? /^1(?:\.0+)?$/.test(row.raw.gamesStarted)
      : row.role === "GOALIE" && row.raw.starter ? /^(true|1(?:\.0+)?)$/i.test(row.raw.starter)
      : undefined;
    target.outcomes.push({
      playerId: row.player.externalId, gameId: fixture.id, seasonYear: season.startYear, role: row.role,
      playedAt: Math.max(startsAt + 4 * 3_600_000, startOfDate + day - 1),
      knownAt: startOfDate + 2 * day,
      pointsTenths: result.totalTenths, missingStats: result.missingStats, started,
      observedTeam: row.team.externalId, observedPositions: row.observedPositions,
    });
  }
  const ordered = [...seasons.values()].sort((a, b) => a.year - b.year);
  const inputs = ordered.map((season): SimulationInput => {
    const games = [...season.fixtures.values()].sort((a, b) => a.startsAt - b.startsAt || compareId(a.id, b.id));
    const draftAt = (games[0]?.startsAt ?? Date.UTC(season.year, 0, 1)) - day;
    const fixtures = games.flatMap((fixture): Fixture[] => fixture.teams.size === 2 ? [{
      ...fixture, teams: [...fixture.teams].sort(compareId), knownAt: draftAt - 1,
    }] : []);
    const pregameHistory = ordered.filter(({ year }) => year < season.year && year >= season.year - 2)
      .flatMap(({ outcomes }) => outcomes);
    const source = {
      hashes, acceptedRows: season.acceptedRows, rejectedRows: summary.rejectedRows,
      unscheduledRows: season.unscheduledRows, excludedFixtures: games.length - fixtures.length,
      assumptions: sport === "MLB" ? [...historicalAssumptions, "MLB rows carry no phase flag. Archived fixtures with unknown phase are included."] : historicalAssumptions,
    };
    return {
      sport, year: season.year, label: season.label, coverage: season.coverage, coverageReason: season.coverageReason,
      mode: "historical-proxy", draftAt, fixtures,
      outcomes: [...pregameHistory, ...season.outcomes],
      roster: [], availability: [], positions: [], source,
    };
  });
  return { inputs, summary, duplicateRows, excludedPhaseRows, nonFantasyRows, quarantinedRows };
}
