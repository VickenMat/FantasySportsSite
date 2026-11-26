import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { listFutureDraftPicks, provisionFutureDraftPicks } from "@/server/dynasty-picks";
import { createLeague } from "@/server/league";

const database = getDatabase();
afterAll(() => database.$disconnect());

it("grants three seasons of four-round dynasty picks independently by sport and retains ownership history", async () => {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, {
    name: `M44 Dynasty ${randomUUID()}`, sports: ["NFL", "NBA"], historical: true, seasonYear: 2080,
    fillWithComputers: true, maxTeams: 2, format: "DYNASTY",
  });
  const sports = await database.leagueSport.findMany({ where: { leagueId: league.id } });
  const nfl = sports.find(({ sport }) => sport === "NFL")!;
  const nba = sports.find(({ sport }) => sport === "NBA")!;
  const futureSeasonsBefore = await database.season.findMany({ where: { sport: "NFL", startYear: { in: [2081, 2082, 2083] } }, orderBy: { startYear: "asc" } });
  await expect(provisionFutureDraftPicks(user.id, league.id, nfl.id)).rejects.toThrow(/finalize league setup/i);
  await database.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
  await expect(provisionFutureDraftPicks(randomUUID(), league.id, nfl.id)).rejects.toThrow(/commissioner/i);
  expect(await provisionFutureDraftPicks(user.id, league.id, nfl.id)).toEqual({ created: 24 });
  expect(await provisionFutureDraftPicks(user.id, league.id, nfl.id)).toEqual({ created: 0 });
  expect(await listFutureDraftPicks(user.id, league.id, nba.id)).toEqual([]);
  const first = await listFutureDraftPicks(user.id, league.id, nfl.id);
  expect(first).toHaveLength(24);
  expect([...new Set(first.map(({ seasonStartYear }) => seasonStartYear))]).toEqual([2081, 2082, 2083]);
  for (const year of [2081, 2082, 2083]) {
    expect(first.filter(({ seasonStartYear }) => seasonStartYear === year).map(({ round }) => round)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  }
  const existing = first[0];
  const original = await database.futureDraftPickOwnership.findFirstOrThrow({ where: { pickId: existing.id } });
  expect(original.ownerTeamId).toBe(existing.originalTeamId);
  await expect(database.futureDraftPickOwnership.update({
    where: { id: original.id }, data: { reason: "mutable" },
  })).rejects.toThrow(/append-only/i);
  expect(await database.season.findMany({ where: { sport: "NFL", startYear: { in: [2081, 2082, 2083] } }, orderBy: { startYear: "asc" } })).toEqual(futureSeasonsBefore);

  const next = await database.season.upsert({ where: { sport_startYear: { sport: "NFL", startYear: 2081 } }, create: { sport: "NFL", startYear: 2081, label: "2081 inventory fixture" }, update: {} });
  await database.leagueSport.update({ where: { id: nfl.id }, data: { seasonId: next.id, seasonLabel: next.label } });
  expect(await provisionFutureDraftPicks(user.id, league.id, nfl.id)).toEqual({ created: 8 });
  const rolled = await listFutureDraftPicks(user.id, league.id, nfl.id);
  expect([...new Set(rolled.map(({ seasonStartYear }) => seasonStartYear))]).toEqual([2082, 2083, 2084]);
  expect(await database.futureDraftPick.count({ where: { leagueSportId: nfl.id } })).toBe(32);
  expect(await database.futureDraftPickOwnership.count({ where: { pick: { leagueSportId: nfl.id } } })).toBe(32);
  await database.league.delete({ where: { id: league.id } });
});

it("rejects future picks in redraft at the service and database boundaries", async () => {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, {
    name: `M44 Redraft ${randomUUID()}`, sports: ["NHL"], format: "REDRAFT", maxTeams: 2,
  });
  const sport = await database.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
  const team = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id } });
  await expect(provisionFutureDraftPicks(user.id, league.id, sport.id)).rejects.toThrow(/redraft/i);
  await expect(database.futureDraftPick.create({ data: {
    leagueSportId: sport.id, seasonStartYear: 2080, round: 1, originalTeamId: team.id, ownerTeamId: team.id,
  } })).rejects.toThrow(/require a dynasty league/i);
  await database.league.delete({ where: { id: league.id } });
});
