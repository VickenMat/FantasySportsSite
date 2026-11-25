import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague, transitionSportSeason } from "@/server/league";
import { assignNextSportSeason, importProfessionalSchedules } from "@/server/scheduling";

const database = getDatabase();
afterAll(() => database.$disconnect());

describe("M4.1 PostgreSQL schedule integrity", () => {
  it("imports immutable source revisions idempotently and persists selected league seasons", async () => {
    const payload = { provider: `m4-test-${randomUUID()}`, sourceName: "M4 integration fixture", sourceVersion: "1",
      retrievedAt: "2088-12-01T00:00:00Z", seasons: [
        { sport: "NFL", startYear: 2090, label: "2090", status: "AVAILABLE", regularSeasonStartsAt: "2090-09-05T00:00:00Z", regularSeasonEndsAt: "2091-01-05T00:00:00Z", postseasonStartsAt: "2091-01-12T00:00:00Z", postseasonEndsAt: "2091-02-10T00:00:00Z" },
        { sport: "NFL", startYear: 2091, label: "2091", status: "AVAILABLE", regularSeasonStartsAt: "2091-09-04T00:00:00Z", regularSeasonEndsAt: "2092-01-04T00:00:00Z", postseasonStartsAt: "2092-01-11T00:00:00Z", postseasonEndsAt: "2092-02-09T00:00:00Z" },
        { sport: "NBA", startYear: 2089, label: "2089-90", status: "AVAILABLE", regularSeasonStartsAt: "2089-10-15T00:00:00Z", regularSeasonEndsAt: "2090-04-15T00:00:00Z", postseasonStartsAt: "2090-04-20T00:00:00Z", postseasonEndsAt: "2090-06-20T00:00:00Z" },
      ] } as const;
    expect(await importProfessionalSchedules(payload)).toMatchObject({ inserted: 3, duplicates: 0 });
    expect(await importProfessionalSchedules(payload)).toMatchObject({ inserted: 0, duplicates: 3 });
    const revision = await database.professionalSeasonScheduleRevision.findFirstOrThrow({ where: { provider: payload.provider, season: { sport: "NFL" } } });
    await expect(database.professionalSeasonScheduleRevision.update({ where: { id: revision.id }, data: { reason: "mutation" } })).rejects.toThrow();

    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, { name: `M4 Schedule ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 4,
      competitionType: "HEAD_TO_HEAD", draftCompleteBy: new Date("2089-02-01T00:00:00Z") });
    try {
      const assignments = await database.leagueSportSeason.findMany({ where: { leagueSport: { leagueId: league.id } }, include: { season: true } });
      expect(assignments.map((item) => [item.season.sport, item.season.label, item.status])).toEqual([
        ["NFL", "2090", "ELIGIBLE"], ["NBA", "2089-90", "ELIGIBLE"],
      ]);
      expect(await database.championshipCycle.count({ where: { leagueId: league.id } })).toBe(1);

      const nextNfl = await assignNextSportSeason(user.id, league.id, "NFL");
      expect((await database.season.findUniqueOrThrow({ where: { id: nextNfl.seasonId } })).startYear).toBe(2091);
      expect(nextNfl.status).toBe("PENDING_CONFIGURATION");
      expect((await assignNextSportSeason(user.id, league.id, "NFL")).id).toBe(nextNfl.id);
      await expect(transitionSportSeason(user.id, league.id, "NFL", 2091)).rejects.toThrow(/authoritative next-season assignment and finalized results/i);
      expect(await database.leagueSportSeason.count({ where: { leagueSport: { leagueId: league.id, sport: "NBA" } } })).toBe(1);

      const nfl = assignments.find((item) => item.season.sport === "NFL")!;
      const game = await database.game.create({ data: { sport: "NFL", seasonId: nfl.seasonId, provider: payload.provider, externalId: randomUUID(), phase: "REGULAR", startsAt: new Date("2090-09-05T00:00:00Z") } });
      const cycle = await database.championshipCycle.findFirstOrThrow({ where: { leagueId: league.id } });
      await database.leagueGameAssignment.create({ data: { leagueId: league.id, leagueSportSeasonId: nfl.id, championshipCycleId: cycle.id, gameId: game.id } });
      await expect(database.leagueGameAssignment.create({ data: { leagueId: league.id, leagueSportSeasonId: nfl.id, championshipCycleId: cycle.id, gameId: game.id } })).rejects.toThrow();
      await database.game.delete({ where: { id: game.id } }).catch(() => undefined);
    } finally { await database.league.delete({ where: { id: league.id } }); }
  });
});
