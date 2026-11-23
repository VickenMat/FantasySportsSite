import type { Sport } from "@/generated/prisma/enums";

export const ubpV9 = {
  name: "Universal Balanced Points V9",
  version: "ubp-v9-experimental",
  experimental: true,
} as const;

const rules: Record<Sport, Record<string, Record<string, number>>> = {
  NFL: {
    all: {
      passing_yards: 1,
      passing_tds: 160,
      passing_interceptions: -80,
      passing_2pt_conversions: 60,
      rushing_yards: 6,
      rushing_tds: 360,
      rushing_2pt_conversions: 103,
      receiving_yards: 6,
      receiving_tds: 360,
      receiving_2pt_conversions: 103,
      receptions: 32,
      rushing_first_downs: 3,
      receiving_first_downs: 3,
      fumbles_lost_total: -103,
    },
    tightEnd: { tight_end_reception_bonus: 7 },
  },
  MLB: {
    hitter: {
      atBats: -12,
      hits: 70,
      doubles: 36,
      triples: 71,
      homeRuns: 118,
      baseOnBalls: 37,
      hitByPitch: 37,
      stolenBases: 24,
      caughtStealing: -35,
    },
    pitcher: {
      pitching_innings: 93,
      pitching_strikeOuts: 25,
      pitching_hits: -32,
      pitching_baseOnBalls: -37,
      pitching_hitBatsmen: -37,
      pitching_homeRuns: -154,
      saves: 62,
      holds: 50,
      blownSaves: -62,
    },
  },
  NBA: {
    all: {
      PTS: 5,
      REB: 6,
      AST: 7,
      STL: 15,
      BLK: 13,
      TOV: -5,
      FGM: 9,
      FGA: -5,
      FTM: 5,
      FTA: -5,
      FG3M: 5,
      OREB: 2,
    },
  },
  NHL: {
    skater: {
      goals: 124,
      assists: 62,
      sog: 7,
      blockedShots: 32,
      hits: 7,
      faceoff_wins: 2,
      shorthanded_points_bonus: 62,
    },
    goalie: {
      goalie_win: 250,
      saves: 12,
      goalsAgainst: -62,
      shutout: 187,
    },
  },
};

export const ubpV9Rules = (Object.keys(rules) as Sport[]).flatMap((sport) =>
  Object.entries(rules[sport]).flatMap(([applicability, actions]) =>
    Object.entries(actions).map(([statKey, coefficientTenths]) => ({
      sport,
      statKey,
      applicability,
      coefficientTenths,
    })),
  ),
);
