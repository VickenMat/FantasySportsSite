import type { Sport } from "@/generated/prisma/enums";
import type { EvidenceClass, EvidenceCoverage } from "./types";

const classes: EvidenceClass[] = ["VERIFIED", "RECONSTRUCTED", "ESTIMATED", "UNSUPPORTED"];

function coverage(kind: EvidenceClass, total: number): EvidenceCoverage {
  return Object.fromEntries(classes.map((candidate) => {
    const count = candidate === kind ? total : 0;
    return [candidate, { count, percent: total && count ? 100 : 0 }];
  })) as EvidenceCoverage;
}

export function historicalEvidence(sport: Sport, rows: number) {
  // These files contain final box scores. Game dates can reconstruct history,
  // but none of the four carries independently published pregame ranks,
  // injuries, rotations, ownership, or a publication timestamp.
  const schedule: EvidenceClass = sport === "NFL" ? "UNSUPPORTED" : "RECONSTRUCTED";
  return {
    draft: coverage("UNSUPPORTED", rows),
    lineup: coverage(schedule, rows),
    waiver: coverage("UNSUPPORTED", rows),
  };
}
