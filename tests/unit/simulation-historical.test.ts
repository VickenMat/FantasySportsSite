import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { historicalSeasons } from "@/simulation/historical";
import { nflRow, writeHistoricalCsv } from "../helpers/historical-csv";

it("joins archived NFL dates in Eastern time and preserves rejected source line references", async () => {
  const path = await mkdtemp(join(tmpdir(), "fantasy-replay-"));
  try {
    const row = { ...nflRow, game_id: "2025_01_OAK_BAL", opponent_team: "LV" };
    const csv = await writeHistoricalCsv(join(path, "stats.csv"), [row, { ...row, player_id: "" }]);
    const nflSchedule = await writeHistoricalCsv(join(path, "schedule.csv"), [
      { game_id: "2025_01_LV_BAL", gameday: "2025-09-07", gametime: "20:20", game_type: "REG" },
    ]);
    const sources = { sport: "NFL" as const, csv };
    await expect(historicalSeasons(sources)).rejects.toThrow(/NFL source rows need/);
    const result = await historicalSeasons({ ...sources, nflSchedule });
    expect(result.quarantinedRows).toEqual([{ line: 3, message: expect.stringContaining("player_id") }]);
    expect(result.summary).toMatchObject({ sourceRows: 2, rejectedRows: 1, validRows: 1 });
    const [season] = result.inputs;
    expect(season).toMatchObject({ coverage: "UNVERIFIED", mode: "historical-proxy", source: { unscheduledRows: 0 } });
    expect(season.fixtures[0].startsAt).toBe(Date.parse("2025-09-08T00:20:00Z"));
    expect(season.outcomes[0].knownAt).toBe(Date.parse("2025-09-09T00:00:00Z"));
    expect(season.outcomes[0].knownAt).toBeGreaterThan(season.outcomes[0].playedAt);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});
