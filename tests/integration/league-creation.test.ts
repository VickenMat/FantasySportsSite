import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { CompetitionType, LeagueFormat, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";

const database = getDatabase();
afterAll(() => database.$disconnect());

type Case = {
  maxTeams: number;
  historical: boolean;
  sports: Sport[];
  format: LeagueFormat;
  competitionType: CompetitionType;
};

const cases: Case[] = [
  { maxTeams: 2, historical: false, sports: ["NFL"], format: "REDRAFT", competitionType: "HEAD_TO_HEAD" },
  { maxTeams: 4, historical: true, sports: ["NBA"], format: "DYNASTY", competitionType: "CUMULATIVE" },
  { maxTeams: 6, historical: false, sports: ["NFL", "NBA"], format: "DYNASTY", competitionType: "HEAD_TO_HEAD" },
  { maxTeams: 8, historical: true, sports: ["MLB", "NHL"], format: "REDRAFT", competitionType: "CUMULATIVE" },
  { maxTeams: 10, historical: false, sports: ["NFL", "MLB", "NBA"], format: "REDRAFT", competitionType: "HEAD_TO_HEAD" },
  { maxTeams: 12, historical: true, sports: ["NFL", "MLB", "NBA", "NHL"], format: "DYNASTY", competitionType: "HEAD_TO_HEAD" },
  { maxTeams: 3, historical: false, sports: ["NHL"], format: "DYNASTY", competitionType: "HEAD_TO_HEAD" },
  { maxTeams: 5, historical: true, sports: ["NFL", "MLB"], format: "REDRAFT", competitionType: "HEAD_TO_HEAD" },
];

describe("fresh league creation", () => {
  it.each(cases)("creates $maxTeams-team $format $competitionType league (historical=$historical, sports=$sports)", async (input) => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, {
      ...input,
      name: `Creation matrix ${input.maxTeams} ${randomUUID()}`,
      seasonYear: input.historical ? 2024 : undefined,
    });
    try {
      const stored = await database.league.findUniqueOrThrow({
        where: { id: league.id },
        include: { sports: true, championshipCycles: true, competitionConfigs: true, sportCompetitions: true, teams: true, members: true },
      });
      const expectedPlayoffTeams = input.competitionType === "CUMULATIVE" ? 0 : input.maxTeams >= 6 ? 6 : input.maxTeams % 2 ? input.maxTeams - 1 : input.maxTeams;
      expect(stored).toMatchObject({ maxTeams: input.maxTeams, format: input.format, competitionType: input.competitionType, isHistorical: input.historical, playoffTeams: expectedPlayoffTeams });
      expect(stored.sports).toHaveLength(input.sports.length);
      const football = stored.sports.find(({ sport }) => sport === "NFL");
      if (football) expect(football.rosterSlots).toEqual(["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "SUPERFLEX"]);
      expect(stored.sportCompetitions).toHaveLength(input.sports.length);
      expect(stored.championshipCycles).toHaveLength(1);
      expect(stored.competitionConfigs).toHaveLength(1);
      expect(stored.teams).toHaveLength(1);
      expect(stored.members).toHaveLength(1);
    } finally {
      await database.league.delete({ where: { id: league.id } });
    }
  });

  it("rolls back every league-owned record when a late transaction constraint fails", async () => {
    const name = `Rollback proof ${randomUUID()}`;
    const before = await database.league.count({ where: { name } });
    await expect(createLeague(randomUUID(), { name, sports: ["NFL", "NBA"], maxTeams: 2, format: "REDRAFT" })).rejects.toThrow();
    expect(await database.league.count({ where: { name } })).toBe(before);
    expect(await database.championshipCycle.count({ where: { league: { name } } })).toBe(0);
    expect(await database.sportCompetition.count({ where: { league: { name } } })).toBe(0);
  });
});
