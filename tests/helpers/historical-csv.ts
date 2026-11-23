import { writeFile } from "node:fs/promises";

type CsvRow = Record<string, string | number>;

export async function writeHistoricalCsv(path: string, rows: CsvRow[], headers = [...new Set(rows.flatMap(Object.keys))]) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const fieldRow = (fields: (string | number)[]) => fields.map(quote).join(",");
  const contents = [fieldRow(headers), ...rows.map((row) => fieldRow(headers.map((header) => row[header] ?? "")))];
  await writeFile(path, contents.join("\r\n") + "\r\n");
  return path;
}

export const nflRow = {
  season: "2025", week: "1", season_type: "REG", game_id: "2025_01_BUF_BAL", player_id: "00-0100001",
  player_display_name: "Test Tight End", team: "BAL", opponent_team: "BUF", position: "TE",
  passing_yards: "0", rushing_yards: "0", receiving_yards: "15", receptions: "2",
  passing_first_downs: "8", rushing_first_downs: "0", receiving_first_downs: "1",
  fumbles_lost_total: "1", rushing_fumbles_lost: "1",
};

export const mlbRow = {
  season: "2025", game_id: "778801", game_date: "2025-04-05", player_id: "1100001",
  player_name: "Player, Two-Way", team_id: "119", team_name: "Los Angeles Dodgers",
  category: "batting", position: "DH,RF", atBats: "3", hits: "2", doubles: "1", homeRuns: "1",
};

export const nbaRow = {
  SEASON_YEAR: "2025-26", GAME_ID: "0022500001", GAME_DATE: "2025-10-25T00:00:00", PLAYER_ID: "1200001",
  PLAYER_NAME: "Test Guard", TEAM_ID: "1610612743", TEAM_ABBREVIATION: "DEN", TEAM_NAME: "Denver Nuggets",
  MATCHUP: "DEN vs. MEM", REB: "4", OREB: "2", PTS: "0", STL: "1", BLK: "1",
};

export const nhlRow = {
  season: "2025-26", game_id: "2025020001", game_date: "2025-10-25", player_id: "1300001", player_name: "Test Skater",
  team: "TOR", category: "forwards", position: "L", goals: "0", assists: "2.0", sog: "4", blockedShots: "0",
  hits: "2", faceoffWinningPctg: "0.50",
};
