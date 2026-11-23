import { expect, it } from "vitest";
import { calculateEligibility, type PositionEvidence } from "@/positions/eligibility";

const effectiveAt = new Date("2025-06-01T20:00:00Z");
const knownAt = new Date("2025-06-01T21:00:00Z");

function appearances(count: number, starts: number, code = "RF"): PositionEvidence[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "FIELDING", code, seasonYear: 2025, effectiveAt, knownAt, gameId: `game-${index}`, started: index < starts,
  }));
}

function positions(evidence: PositionEvidence[], seasonYear = 2025, asOf = knownAt) {
  return calculateEligibility({ sport: "MLB", seasonYear, asOf, evidence });
}

it("qualifies on the tenth start or twentieth distinct appearance", () => {
  expect(positions(appearances(9, 9)).positions).toEqual([]);
  expect(positions(appearances(10, 10)).positions).toEqual(["RF"]);
  expect(positions(appearances(19, 4)).positions).toEqual([]);
  expect(positions(appearances(20, 4)).positions).toEqual(["RF"]);
  expect(positions([...appearances(19, 4), ...appearances(1, 0)]).positions).toEqual([]);
});

it("carries earned eligibility for one following season and expires it afterward", () => {
  const evidence = appearances(10, 10);
  expect(positions(evidence, 2026).positions).toEqual(["RF"]);
  expect(positions(evidence, 2027)).toMatchObject({ positions: [], available: false });
});

it("requires both effective and known times by lock, and retains listed positions for their season", () => {
  const evidence: PositionEvidence[] = [
    ...appearances(10, 10),
    { kind: "LISTED", code: "DH", seasonYear: 2025, effectiveAt, knownAt: new Date("2025-03-15T00:00:00Z") },
  ];
  expect(positions(evidence, 2025, new Date("2025-06-01T19:59:59Z")).available).toBe(false);
  expect(positions(evidence, 2025, new Date("2025-06-01T20:59:59Z")).positions).toEqual(["DH"]);
  expect(positions(evidence).positions).toEqual(["DH", "RF"]);
  expect(positions(evidence, 2026).positions).toEqual(["RF"]);
});
