import type { Sport } from "@/generated/prisma/enums";

export const parquetSources: Record<Sport, {
  filename: string;
  seasonColumn: string;
  identityColumns: readonly string[];
  requiredColumns: readonly string[];
}> = {
  NFL: {
    filename: "nfl_2016_2026_final.parquet",
    seasonColumn: "season",
    identityColumns: ["season", "game_id", "player_id", "team"],
    requiredColumns: ["season", "week", "season_type", "game_id", "player_id", "player_display_name", "team", "opponent_team", "position"],
  },
  MLB: {
    filename: "mlb_2016_2026_final.parquet",
    seasonColumn: "season",
    identityColumns: ["season", "game_id", "player_id", "team_id", "category"],
    requiredColumns: ["season", "game_id", "game_date", "player_id", "player_name", "team_id", "team_name", "category"],
  },
  NBA: {
    filename: "nba_2016_2027.parquet",
    seasonColumn: "SEASON_YEAR",
    identityColumns: ["SEASON_YEAR", "GAME_ID", "PLAYER_ID", "TEAM_ID"],
    requiredColumns: ["SEASON_YEAR", "GAME_ID", "GAME_DATE", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "MATCHUP"],
  },
  NHL: {
    filename: "nhl_2016_2027_final.parquet",
    seasonColumn: "season",
    identityColumns: ["season", "game_id", "player_id", "team", "category"],
    requiredColumns: ["season", "game_id", "game_date", "player_id", "player_name", "team", "category", "position"],
  },
};

export const priorValidatedRows: Record<Sport, number> = {
  NFL: 185_368,
  MLB: 794_974,
  NBA: 260_499,
  NHL: 506_116,
};

export function startYear(value: unknown) {
  const match = /^(\d{4})(?:-\d{2})?$/.exec(String(value ?? ""));
  return match ? Number(match[1]) : null;
}
