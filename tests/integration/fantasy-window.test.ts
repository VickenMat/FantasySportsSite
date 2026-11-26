import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { importProfessionalSchedules } from "@/server/scheduling";
import { configureFantasyWindow } from "@/server/fantasy-windows";
import { provisionCompetitionSchedule } from "@/server/competition";
const db = getDatabase();
afterAll(() => db.$disconnect());
it("reconciles a commissioner fantasy calendar within verified bounds and groups independent fourteen-day matchups", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Window fixture ${randomUUID()}`, sports: ["NBA"], maxTeams: 2, historical: true, seasonYear: 2074, fillWithComputers: true });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const input = { leagueSportId: sport.id, seasonId: sport.seasonId, startsAt: new Date("2074-09-01"), endsAt: new Date("2074-09-30"), playoffStartsAt: new Date("2074-09-15"), playoffEndsAt: new Date("2074-09-30"), matchupDays: 14, reason: "Explicit synthetic fantasy calendar" };
    await expect(configureFantasyWindow(user.id, input)).rejects.toThrow(/PENDING_DATA/);
    await importProfessionalSchedules({ provider: `window-fixture-${randomUUID()}`, sourceName: "Isolated verified-boundary fixture", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NBA", startYear: 2074, label: "2074-75", status: "AVAILABLE", regularSeasonStartsAt: "2074-09-01", regularSeasonEndsAt: "2074-10-01", postseasonStartsAt: "2074-10-10", postseasonEndsAt: "2074-11-01" }] });
    await expect(configureFantasyWindow(randomUUID(), input)).rejects.toThrow(/commissioner/);
    await expect(configureFantasyWindow(user.id, { ...input, startsAt: new Date("2074-08-01") })).rejects.toThrow(/fit within/);
    const window = await configureFantasyWindow(user.id, input);
    await expect(db.fantasyWindowRevision.update({ where: { id: window.id }, data: { matchupDays: 7 } })).rejects.toThrow(/append-only/);
    const assignment = await db.leagueSportSeason.findFirstOrThrow({ where: { leagueSportId: sport.id } });
    expect(assignment.tradeDeadlineAt).toEqual(new Date("2074-09-01"));
    for (const date of ["2074-09-02", "2074-09-09", "2074-09-16", "2074-09-23"]) await db.game.create({ data: { sport: "NBA", seasonId: sport.seasonId, provider: "isolated-window", externalId: randomUUID(), phase: "REGULAR", startsAt: new Date(date) } });
    const competition = await db.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id } });
    await provisionCompetitionSchedule(user.id, competition.id);
    const periods = await db.scoringPeriod.findMany({ where: { competitionId: competition.id }, include: { games: true } });
    expect(periods.map(({ periodType }) => periodType).sort()).toEqual(["PLAYOFF", "REGULAR"]);
    expect(periods.every(({ games }) => games.length === 2)).toBe(true);
    await expect(configureFantasyWindow(user.id, input)).rejects.toThrow(/before periods/);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
