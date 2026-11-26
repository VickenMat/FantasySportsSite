const labels: Record<string, string> = {
  PTS: "Points", REB: "Rebounds", AST: "Assists", STL: "Steals", BLK: "Blocks", TOV: "Turnovers",
  FGM: "Field Goals Made", FGA: "Field Goals Attempted", FTM: "Free Throws Made", FTA: "Free Throws Attempted", FG3M: "Three-Pointers Made", OREB: "Offensive Rebounds",
  atBats: "At-Bats", homeRuns: "Home Runs", baseOnBalls: "Walks", hitByPitch: "Hit By Pitch", stolenBases: "Stolen Bases", caughtStealing: "Caught Stealing",
  pitching_strikeOuts: "Pitching Strikeouts", pitching_baseOnBalls: "Walks Allowed", pitching_hitBatsmen: "Hit Batters", pitching_homeRuns: "Home Runs Allowed", pitching_hits: "Hits Allowed", blownSaves: "Blown Saves",
  blockedShots: "Blocked Shots", goalsAgainst: "Goals Against", sog: "Shots on Goal",

  fumbles_lost_total: "Fumbles Lost",
  passing_yards: "Passing Yards",
  receiving_yards: "Receiving Yards",
  offensive_rebounds: "Offensive Rebounds",
  faceoff_wins: "Faceoff Wins",
};

export function statisticDisplayName(statKey: string) {
  return labels[statKey] ?? statKey.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
