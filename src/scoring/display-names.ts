const labels: Record<string, string> = {
  fumbles_lost_total: "Fumbles Lost",
  passing_yards: "Passing Yards",
  receiving_yards: "Receiving Yards",
  offensive_rebounds: "Offensive Rebounds",
  faceoff_wins: "Faceoff Wins",
};

export function statisticDisplayName(statKey: string) {
  return labels[statKey] ?? statKey.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
