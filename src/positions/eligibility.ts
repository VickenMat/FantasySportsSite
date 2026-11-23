import type { Sport } from "@/generated/prisma/enums";

export type PositionEvidence = {
  code: string;
  seasonYear: number;
  effectiveAt: Date;
  knownAt: Date;
} & (
  | { kind: "LISTED" }
  | { kind: "FIELDING"; gameId: string; started: boolean }
);

export function calculateEligibility(input: {
  sport: Sport; seasonYear: number; asOf: Date; evidence: readonly PositionEvidence[];
}) {
  const { sport, seasonYear, asOf } = input;
  const listed = new Set<string>();
  const fielding = new Map<number, Map<string, Map<string, boolean>>>();
  let hasEvidence = false;

  for (const entry of input.evidence) {
    if (entry.effectiveAt > asOf || entry.knownAt > asOf) continue;
    if (entry.kind === "LISTED") {
      if (entry.seasonYear === seasonYear) {
        listed.add(entry.code);
        hasEvidence = true;
      }
      continue;
    }
    if (sport !== "MLB" || (entry.seasonYear !== seasonYear && entry.seasonYear !== seasonYear - 1)) continue;
    hasEvidence = true;
    const season = fielding.get(entry.seasonYear) ?? new Map<string, Map<string, boolean>>();
    const games = season.get(entry.code) ?? new Map<string, boolean>();
    games.set(entry.gameId, entry.started || games.get(entry.gameId) === true);
    season.set(entry.code, games);
    fielding.set(entry.seasonYear, season);
  }

  const fieldingCounts: { seasonYear: number; code: string; starts: number; appearances: number }[] = [];
  const eligible = new Set(listed);
  for (const [year, season] of fielding) {
    for (const [code, games] of season) {
      const starts = [...games.values()].filter(Boolean).length;
      fieldingCounts.push({ seasonYear: year, code, starts, appearances: games.size });
      if (starts >= 10 || games.size >= 20) eligible.add(code);
    }
  }

  return {
    available: hasEvidence,
    positions: [...eligible].sort(),
    fieldingCounts: fieldingCounts.sort((a, b) => a.seasonYear - b.seasonYear || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
  };
}
