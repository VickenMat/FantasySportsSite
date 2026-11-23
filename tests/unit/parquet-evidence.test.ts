import { expect, it } from "vitest";
import { historicalEvidence } from "@/parquet/evidence";

it("does not promote reconstructed or unsupported Parquet facts to verified evidence", () => {
  const nba = historicalEvidence("NBA", 10);
  expect(nba.lineup.RECONSTRUCTED).toEqual({ count: 10, percent: 100 });
  expect(nba.lineup.VERIFIED.count).toBe(0);
  expect(nba.draft.UNSUPPORTED.percent).toBe(100);
  expect(nba.waiver.UNSUPPORTED.percent).toBe(100);

  const nfl = historicalEvidence("NFL", 10);
  expect(nfl.lineup.UNSUPPORTED.percent).toBe(100);
});
