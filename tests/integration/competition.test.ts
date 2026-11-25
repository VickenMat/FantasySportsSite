import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { ensureRecordedDraw, provisionCompetitionSchedule } from "@/server/competition";

const database = getDatabase();
afterAll(() => database.$disconnect());

describe("M4.2 persistent competition", () => {
  it("provisions independent NFL H2H periods through Week 17 and preserves an immutable config", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, { name: `M42 H2H ${randomUUID()}`, sports: ["NFL"], maxTeams: 6, historical: true, seasonYear: 2085, fillWithComputers: true });
    const leagueSport = await database.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: league.id, sport: "NFL" } } });
    const competition = await database.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id } });
    const gameIds: string[] = [];
    try {
      for (let week = 1; week <= 18; week++) {
        const game = await database.game.create({ data: { sport: "NFL", seasonId: leagueSport.seasonId, provider: "m42-fixture", externalId: randomUUID(), phase: "REGULAR", week,
          startsAt: new Date(Date.UTC(2085, 8, week * 7)) } }); gameIds.push(game.id);
      }
      const eligibleGameCount = await database.game.count({ where: { seasonId: leagueSport.seasonId, phase: "REGULAR", startsAt: { not: null }, week: { lte: 17 } } });
      await provisionCompetitionSchedule(user.id, competition.id);
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id } })).toBe(17);
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id, periodType: "PLAYOFF" } })).toBe(3);
      expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(42);
      expect(await database.competitionPeriodGame.count({ where: { sportCompetitionId: competition.id } })).toBe(eligibleGameCount);
      const config = await database.competitionConfigSnapshot.findFirstOrThrow({ where: { leagueId: league.id } });
      await expect(database.competitionConfigSnapshot.update({ where: { id: config.id }, data: { championPoints: 99 } })).rejects.toThrow(/append-only/i);
      const teams = await database.fantasyTeam.findMany({ where: { leagueId: league.id }, select: { id: true } });
      const first = await ensureRecordedDraw(league.id, "STANDINGS", competition.id, teams.map(({ id }) => id));
      const second = await ensureRecordedDraw(league.id, "STANDINGS", competition.id, teams.map(({ id }) => id));
      expect(second.map(({ randomToken }) => randomToken)).toEqual(first.map(({ randomToken }) => randomToken));
    } finally { await database.league.delete({ where: { id: league.id } }); await database.game.deleteMany({ where: { id: { in: gameIds } } }).catch(() => undefined); }
  });

  it("includes NFL Week 18 for cumulative competition and creates no matchups or playoffs", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, { name: `M42 Cumulative ${randomUUID()}`, sports: ["NFL"], maxTeams: 4, historical: true, seasonYear: 2086,
      fillWithComputers: true, competitionType: "CUMULATIVE" });
    const leagueSport = await database.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: league.id, sport: "NFL" } } });
    const competition = await database.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id }, include: { configSnapshot: true } });
    const gameIds: string[] = [];
    try {
      for (let week = 1; week <= 18; week++) {
        const game = await database.game.create({ data: { sport: "NFL", seasonId: leagueSport.seasonId, provider: "m42-fixture", externalId: randomUUID(), phase: "REGULAR", week,
          startsAt: new Date(Date.UTC(2086, 8, week * 7)) } }); gameIds.push(game.id);
      }
      await provisionCompetitionSchedule(user.id, competition.id);
      expect(competition.configSnapshot).toMatchObject({ playoffTeams: 0, playoffWeeks: 0 });
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id } })).toBe(18);
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id, periodType: "PLAYOFF" } })).toBe(0);
      expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(0);
    } finally { await database.league.delete({ where: { id: league.id } }); await database.game.deleteMany({ where: { id: { in: gameIds } } }).catch(() => undefined); }
  });
});
