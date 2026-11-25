import { describe, expect, it } from "vitest";
import type { Sport } from "@/generated/prisma/client";
import { buildSchedulePreview, scheduleSourceSchema, selectNextSeasonRevision, type ScheduleRevision } from "@/server/scheduling";

const revision = (id: string, sport: Sport, startYear: number, starts: string, ends: string, extra: Partial<ScheduleRevision> = {}): ScheduleRevision => ({
  id, status: "AVAILABLE", retrievedAt: new Date("2026-12-01T00:00:00Z"), regularSeasonStartsAt: new Date(starts), regularSeasonEndsAt: new Date(ends),
  postseasonStartsAt: null, postseasonEndsAt: null, season: { id: `season-${id}`, sport, startYear, label: sport === "NBA" || sport === "NHL" ? `${startYear}-${String(startYear + 1).slice(-2)}` : String(startYear) }, ...extra,
});

describe("M4.1 source-backed championship scheduling", () => {
  it("selects the earliest not-started season and excludes the active NBA season in February 2027", () => {
    const rows = [
      revision("nfl-27", "NFL", 2027, "2027-09-09T00:00:00Z", "2028-01-10T00:00:00Z"),
      revision("mlb-27", "MLB", 2027, "2027-03-25T00:00:00Z", "2027-10-03T00:00:00Z"),
      revision("nba-26", "NBA", 2026, "2026-10-20T00:00:00Z", "2027-04-15T00:00:00Z"),
      revision("nba-27", "NBA", 2027, "2027-10-19T00:00:00Z", "2028-04-14T00:00:00Z"),
      revision("nhl-27", "NHL", 2027, "2027-10-05T00:00:00Z", "2028-04-15T00:00:00Z"),
    ];
    const preview = buildSchedulePreview({ sports: ["NFL", "MLB", "NBA", "NHL"], draftCompleteBy: new Date("2027-02-15T00:00:00Z"), competitionType: "CUMULATIVE" }, rows);
    expect(Object.fromEntries(preview.map((item) => [item.sport, item.seasonLabel]))).toEqual({ NFL: "2027", MLB: "2027", NBA: "2027-28", NHL: "2027-28" });
  });

  it("uses only the latest revision for a season and never falls back to invented dates", () => {
    const old = revision("old", "NFL", 2027, "2027-09-09T00:00:00Z", "2028-01-10T00:00:00Z");
    const withdrawn: ScheduleRevision = { ...old, id: "withdrawn", status: "UNAVAILABLE", retrievedAt: new Date("2027-01-01T00:00:00Z"), regularSeasonStartsAt: null, regularSeasonEndsAt: null };
    const [preview] = buildSchedulePreview({ sports: ["NFL"], draftCompleteBy: new Date("2027-02-01T00:00:00Z"), competitionType: "HEAD_TO_HEAD" }, [old, withdrawn]);
    expect(preview).toMatchObject({ status: "UNAVAILABLE", seasonId: null, draftDeadlineAt: null, tradeDeadlineAt: null });
  });

  it("derives deadlines only from supplied schedule boundaries", () => {
    const nba = revision("nba", "NBA", 2027, "2027-10-19T00:00:00Z", "2028-04-14T00:00:00Z", { postseasonStartsAt: new Date("2028-04-20T00:00:00Z"), postseasonEndsAt: new Date("2028-06-20T00:00:00Z") });
    const [headToHead] = buildSchedulePreview({ sports: ["NBA"], draftCompleteBy: new Date("2027-02-01T00:00:00Z"), competitionType: "HEAD_TO_HEAD" }, [nba]);
    const [cumulative] = buildSchedulePreview({ sports: ["NBA"], draftCompleteBy: new Date("2027-02-01T00:00:00Z"), competitionType: "CUMULATIVE" }, [nba]);
    expect(headToHead.tradeDeadlineAt).toBeNull();
    expect(headToHead.playoffStartsAt).toBeNull();
    const [configured] = buildSchedulePreview({ sports: ["NBA"], draftCompleteBy: new Date("2027-02-01T00:00:00Z"), competitionType: "HEAD_TO_HEAD",
      fantasyPlayoffs: { NBA: { startsAt: new Date("2028-03-20T00:00:00Z"), endsAt: new Date("2028-04-10T00:00:00Z") } } }, [nba]);
    expect(configured.tradeDeadlineAt?.toISOString()).toBe("2028-03-06T00:00:00.000Z");
    expect(cumulative.tradeDeadlineAt?.toISOString()).toBe("2028-03-31T00:00:00.000Z");
    expect(headToHead.rolloverEligibleAt?.toISOString()).toBe("2028-06-20T00:00:00.000Z");
  });

  it("rejects an AVAILABLE source record without a complete regular-season window", () => {
    expect(scheduleSourceSchema.safeParse({ provider: "source", sourceName: "schedule", sourceVersion: "1", retrievedAt: "2027-01-01T00:00:00Z", seasons: [
      { sport: "NFL", startYear: 2027, label: "2027", status: "AVAILABLE", regularSeasonStartsAt: "2027-09-01T00:00:00Z" },
    ] }).success).toBe(false);
  });

  it("assigns the immediate next professional season even while other sports can remain active", () => {
    const rows = [
      revision("nfl-29", "NFL", 2029, "2029-09-01T00:00:00Z", "2030-01-10T00:00:00Z"),
      revision("nfl-28", "NFL", 2028, "2028-09-01T00:00:00Z", "2029-01-10T00:00:00Z"),
    ];
    expect(selectNextSeasonRevision("NFL", 2027, rows)?.season.startYear).toBe(2028);
  });
});
