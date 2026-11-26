import type { GamePhase, GameSide, GameStatRole, SeasonCoverage, Sport } from "@/generated/prisma/enums";
import { applicableRules, maxStatCount, signedStats, type StatValues } from "@/scoring/engine";
import { ubpV9Rules } from "@/scoring/ubp-v9";

export const historicalProvider = "v9-historical";
export const importerVersion = "historical-csv-1";

export type RawRow = Record<string, string>;
type Team = { externalId: string; code: string | null; displayName: string; side: GameSide };
export type HistoricalRow = {
  season: { startYear: number; label: string; coverage: SeasonCoverage; coverageReason: string | null };
  game: { externalId: string; gameDate: Date | null; week: number | null; phase: GamePhase };
  player: { externalId: string; displayName: string };
  team: Team;
  opponent?: Team;
  role: GameStatRole;
  observedPositions: string[];
  stats: StatValues;
  raw: RawRow;
  line: number;
};

const identityHeaders: Record<Sport, readonly string[]> = {
  NFL: ["season", "week", "season_type", "game_id", "player_id", "player_display_name", "team", "opponent_team"],
  MLB: ["season", "game_id", "game_date", "player_id", "player_name", "team_id", "team_name", "category"],
  NBA: ["SEASON_YEAR", "GAME_ID", "GAME_DATE", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "MATCHUP"],
  NHL: ["season", "game_id", "game_date", "player_id", "player_name", "team", "category"],
};

const scoringHeaders: Record<Sport, ReadonlySet<string>> = {
  NFL: new Set(ubpV9Rules.filter((rule) => rule.sport === "NFL" && rule.applicability === "all").map((rule) => rule.statKey)),
  MLB: new Set(["atBats", "outs", "inningsPitched", "hits", "strikeOuts", "saves"]),
  NBA: new Set(ubpV9Rules.filter((rule) => rule.sport === "NBA").map((rule) => rule.statKey)),
  NHL: new Set(["goals", "assists", "sog", "saves", "goalsAgainst", "decision", "goalie_win", "shutout"]),
};

export class InvalidHistoricalRow extends Error {}

function fail(message: string): never {
  throw new InvalidHistoricalRow(message);
}

export function validateHeaders(sport: Sport, headers: string[]) {
  if (headers.some((key) => !key || key.includes("\u0000")) || new Set(headers).size !== headers.length) {
    throw new Error("CSV headers must be nonempty, unique column names.");
  }
  const missing = identityHeaders[sport].filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`Missing ${sport} identity columns: ${missing.join(", ")}.`);
  if (!headers.some((column) => scoringHeaders[sport].has(column))) {
    throw new Error(`CSV contains no recognizable ${sport} scoring columns.`);
  }
  return headers;
}

function required(raw: RawRow, column: string) {
  const value = raw[column]?.trim();
  if (!value || value.length > 200 || value.includes("\u0000")) fail(`Invalid or missing ${column}.`);
  return value;
}

function numericId(raw: RawRow, column: string) {
  const value = required(raw, column);
  if (!/^\d{1,25}$/.test(value)) fail(`Invalid numeric ID in ${column}.`);
  return value;
}

function count(raw: RawRow, column: string, signed = false): number | null {
  const value = raw[column]?.trim();
  if (!value || /^(?:NA|N\/A|NaN|null|--)$/i.test(value)) return null;
  if (!/^-?\d+(?:\.0+)?$/.test(value)) fail(`Expected an integer in ${column}.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || Math.abs(result) > maxStatCount || (!signed && result < 0)) {
    fail(`Stat outside its valid range in ${column}.`);
  }
  return result || 0;
}

function boolean(raw: RawRow, column: string) {
  const value = raw[column]?.trim().toLowerCase();
  if (!value) return null;
  if (["true", "1", "1.0"].includes(value)) return true;
  if (["false", "0", "0.0"].includes(value)) return false;
  return fail(`Invalid boolean in ${column}.`);
}

function seasonFor(sport: Sport, label: string): HistoricalRow["season"] {
  const crossYear = sport === "NBA" || sport === "NHL";
  const match = label.match(crossYear ? /^(\d{4})-(\d{2})$/ : /^(\d{4})$/);
  if (!match) fail("Season label has the wrong format.");
  const startYear = Number(match[1]);
  if (startYear < 1900 || startYear > 2100 || (crossYear && Number(match[2]) !== (startYear + 1) % 100)) {
    fail("Season label does not identify consecutive years.");
  }
  if (startYear >= 2026) {
    return { startYear, label, coverage: "PARTIAL", coverageReason: "Excluded from complete-season comparisons under V9." };
  }
  if ((sport === "MLB" && startYear === 2020) || (crossYear && (startYear === 2019 || startYear === 2020))) {
    return { startYear, label, coverage: "QUARANTINED", coverageReason: "COVID-disrupted season under V9." };
  }
  return { startYear, label, coverage: "UNVERIFIED", coverageReason: "Game logs alone cannot certify fixture completeness." };
}

function dateFor(raw: RawRow, column: string, season: HistoricalRow["season"], sport: Sport) {
  const input = required(raw, column);
  const match = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.0+)?Z?)?$/.exec(input);
  if (!match) fail(`Invalid calendar date in ${column}.`);
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) fail(`Invalid calendar date in ${column}.`);
  const year = date.getUTCFullYear();
  if (year < season.startYear || year > season.startYear + (sport === "MLB" ? 0 : 1)) {
    fail(`Game date in ${column} falls outside the season years.`);
  }
  return date;
}

function positionCodes(raw: RawRow, sport: Sport) {
  const positions = new Set<string>();
  for (const token of (raw.position ?? "").split(",")) {
    let code = token.trim().toUpperCase();
    if (!code || ["NA", "N/A", "NULL", "UNKNOWN", "--"].includes(code)) continue;
    if (sport === "NHL" && code === "L") code = "LW";
    if (sport === "NHL" && code === "R") code = "RW";
    if (!/^[A-Z0-9]{1,12}$/.test(code)) fail("Invalid position code.");
    positions.add(code);
  }
  return [...positions].sort();
}

function teamCode(value: string) {
  if (!/^[A-Z0-9]{2,5}$/.test(value)) fail("Invalid team abbreviation.");
  return value;
}

function codeTeam(code: string, side: GameSide = "UNKNOWN"): Team {
  return { externalId: code, code, displayName: code, side };
}

function nflTeamCode(value: string) {
  const aliases: Record<string, string> = { OAK: "LV", SD: "LAC" };
  return teamCode(aliases[value] ?? value);
}

export function baseballOuts(notation: string): number {
  const match = /^(\d+)(?:\.([012]))?$/.exec(notation.trim());
  if (!match) return fail("Invalid baseball innings notation in inningsPitched.");
  const outs = Number(match[1]) * 3 + Number(match[2] ?? "0");
  if (!Number.isSafeInteger(outs) || outs > maxStatCount) fail("Pitching outs exceed the supported range.");
  return outs;
}

function pitchingOuts(raw: RawRow) {
  const outs = count(raw, "outs");
  const notation = raw.inningsPitched?.trim();
  const fromNotation = notation && !/^(?:NA|N\/A|NaN|null|--)$/i.test(notation) ? baseballOuts(notation) : null;
  if (outs != null && fromNotation != null && outs !== fromNotation) fail("Pitching outs disagree with inningsPitched.");
  return outs ?? fromNotation;
}

const pitchingColumns: Record<string, string> = {
  pitching_strikeOuts: "strikeOuts",
  pitching_hits: "hits",
  pitching_baseOnBalls: "baseOnBalls",
  pitching_hitBatsmen: "hitBatsmen",
  pitching_homeRuns: "homeRuns",
};

const rawRulesByRole = Object.fromEntries(
  (["FOOTBALL", "HITTER", "PITCHER", "BASKETBALL", "SKATER", "GOALIE"] as const).map((role) =>
    [role, applicableRules(ubpV9Rules, role).filter(({ applicability }) => applicability !== "tightEnd")],
  ),
) as Record<GameStatRole, typeof ubpV9Rules>;

function normalizeStats(raw: RawRow, role: GameStatRole): StatValues {
  const stats: StatValues = {};
  for (const { statKey } of rawRulesByRole[role]) {
    if (statKey === "pitching_innings") stats.pitching_outs = pitchingOuts(raw);
    else if (role !== "GOALIE" || (statKey !== "goalie_win" && statKey !== "shutout")) {
      const sourceKey = role === "PITCHER" ? (pitchingColumns[statKey] ?? statKey) : statKey;
      stats[statKey] = count(raw, sourceKey, signedStats.has(statKey));
    }
  }

  if (role === "GOALIE") {
    const decision = raw.decision?.trim();
    if (decision && !["W", "L", "O"].includes(decision)) fail("Invalid NHL goalie decision.");
    const time = raw.toi?.trim();
    const timeMatch = time ? /^(\d{1,3}):([0-5]\d)$/.exec(time) : null;
    if (time && !timeMatch) fail("Invalid NHL time on ice.");
    const seconds = timeMatch ? 60 * Number(timeMatch[1]) + Number(timeMatch[2]) : null;
    boolean(raw, "starter");
    const explicitWin = count(raw, "goalie_win");
    const explicitShutout = count(raw, "shutout");
    if ((explicitWin ?? 0) > 1 || (explicitShutout ?? 0) > 1) fail("NHL win and shutout must be binary.");
    if (decision && explicitWin != null && explicitWin !== Number(decision === "W")) fail("NHL goalie win disagrees with decision.");
    if (explicitShutout === 1 && (stats.goalsAgainst ?? 0) > 0) fail("NHL shutout conflicts with goals against.");
    stats.goalie_win = explicitWin ?? (decision ? Number(decision === "W") : seconds === 0 ? 0 : null);
    // Zero goals against and elapsed ice time do not establish an explicit credit.
    stats.shutout = explicitShutout ?? ((stats.goalsAgainst ?? 0) > 0 || seconds === 0 ? 0 : null);
  }
  return stats;
}

export function normalizeHistoricalRow(sport: Sport, raw: RawRow, line: number): HistoricalRow {
  if (Object.values(raw).some((value) => value.includes("\u0000"))) fail("Row contains a null byte.");
  const season = seasonFor(sport, required(raw, sport === "NBA" ? "SEASON_YEAR" : "season"));
  const observedPositions = positionCodes(raw, sport);
  let player: HistoricalRow["player"];
  let game: HistoricalRow["game"];
  let team: Team;
  let opponent: Team | undefined;
  let role: GameStatRole;

  if (sport === "NFL") {
    const week = count(raw, "week");
    const externalId = required(raw, "game_id");
    const match = /^(\d{4})_(\d{1,2})_([A-Z0-9]+)_([A-Z0-9]+)$/.exec(externalId);
    if (!match || week == null || week > 30 || Number(match[1]) !== season.startYear || Number(match[2]) !== week) {
      fail("NFL game ID, season, and week must agree.");
    }
    const away = nflTeamCode(match[3]);
    const home = nflTeamCode(match[4]);
    if (away === home) fail("NFL game has duplicate teams.");
    const opponentValue = raw.opponent_team?.trim();
    const opponentCode = opponentValue ? nflTeamCode(opponentValue) : undefined;
    const teamValue = raw.team?.trim();
    const code = teamValue ? nflTeamCode(teamValue) : opponentCode === home ? away : opponentCode === away ? home : undefined;
    if (!code || (code !== home && code !== away) || (opponentCode && opponentCode !== (code === home ? away : home))) {
      fail("NFL teams disagree with the fixture ID.");
    }
    team = codeTeam(code, code === home ? "HOME" : "AWAY");
    opponent = codeTeam(code === home ? away : home, code === home ? "AWAY" : "HOME");
    const type = required(raw, "season_type");
    const phase = type === "REG" ? "REGULAR" : type === "POST" ? "POSTSEASON" : type === "PRE" ? "PRESEASON" : fail("Unknown NFL season type.");
    const externalPlayerId = required(raw, "player_id");
    if (!/^\d{2}-\d{7}$/.test(externalPlayerId)) fail("Invalid NFL player ID.");
    player = { externalId: externalPlayerId, displayName: required(raw, "player_display_name") };
    game = { externalId, gameDate: null, week, phase };
    role = "FOOTBALL";
  } else if (sport === "NBA") {
    const code = teamCode(required(raw, "TEAM_ABBREVIATION"));
    const matchup = /^([A-Z0-9]{2,5}) (@|vs\.) ([A-Z0-9]{2,5})$/.exec(required(raw, "MATCHUP"));
    if (!matchup || matchup[1] !== code || matchup[3] === code) fail("NBA matchup disagrees with the source team.");
    team = { externalId: numericId(raw, "TEAM_ID"), code, displayName: required(raw, "TEAM_NAME"), side: matchup[2] === "@" ? "AWAY" : "HOME" };
    player = { externalId: numericId(raw, "PLAYER_ID"), displayName: required(raw, "PLAYER_NAME") };
    const externalId = numericId(raw, "GAME_ID");
    const phase = externalId.startsWith("002") ? "REGULAR" : externalId.startsWith("004") ? "POSTSEASON" : externalId.startsWith("001") ? "PRESEASON" : "UNKNOWN";
    game = { externalId, gameDate: dateFor(raw, "GAME_DATE", season, sport), week: null, phase };
    role = "BASKETBALL";
  } else {
    player = { externalId: numericId(raw, "player_id"), displayName: required(raw, "player_name") };
    const externalId = numericId(raw, "game_id");
    const category = required(raw, "category");
    let phase: GamePhase = "UNKNOWN";
    if (sport === "MLB") {
      team = { externalId: numericId(raw, "team_id"), displayName: required(raw, "team_name"), code: null, side: "UNKNOWN" };
      role = category === "batting" ? "HITTER" : category === "pitching" ? "PITCHER" : fail("Unknown MLB stat category.");
    } else {
      team = codeTeam(teamCode(required(raw, "team")));
      role = category === "goalies" ? "GOALIE" : category === "forwards" || category === "defense" ? "SKATER" : fail("Unknown NHL stat category.");
      const kind = externalId.slice(4, 6);
      phase = kind === "02" ? "REGULAR" : kind === "03" ? "POSTSEASON" : kind === "01" ? "PRESEASON" : "UNKNOWN";
    }
    game = { externalId, gameDate: dateFor(raw, "game_date", season, sport), week: null, phase };
  }

  return { season, game, player, team, opponent, role, observedPositions, stats: normalizeStats(raw, role), raw, line };
}
