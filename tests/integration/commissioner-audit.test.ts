import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { listCommissionerAudit } from "@/server/commissioner-audit";
import { createLeague, updateDraftOrder, updateLeagueSettings } from "@/server/league";

const database = getDatabase();
afterAll(() => database.$disconnect());

it("records authorized league and sport settings atomically, with append-only before and after values", async () => {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, {
    name: `M47 Audit ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, fillWithComputers: true,
    historical: true, competitionType: "CUMULATIVE",
  });
  const settings = {
    sport: "NFL" as const, draftSecondsPerPick: 45, startingFaab: 100, draftRounds: 14,
    visibility: "PUBLIC" as const, playoffTeams: 0, playoffPeriods: 0,
  };
  await expect(updateLeagueSettings(user.id, league.id, { ...settings, sport: "NBA", maxTeams: 4 })).rejects.toThrow();
  await expect(updateLeagueSettings(user.id, league.id, { ...settings, playoffTeams: 2, playoffPeriods: 1 })).rejects.toThrow(/no fantasy playoffs/i);
  expect(await listCommissionerAudit(user.id, league.id)).toEqual([]);
  expect(await database.league.findUniqueOrThrow({ where: { id: league.id } })).toMatchObject({ maxTeams: 2, visibility: "PRIVATE" });

  await updateLeagueSettings(user.id, league.id, settings);
  await updateLeagueSettings(user.id, league.id, settings);
  const teams = await database.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "desc" } });
  await updateDraftOrder(user.id, league.id, "NFL", teams.map(({ id }) => id));
  const events = await listCommissionerAudit(user.id, league.id);
  expect(events).toHaveLength(3);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      actorUserId: user.id, action: "UPDATE_GAMEPLAY_SETTINGS", targetType: "League",
      before: { visibility: "PRIVATE" }, after: { visibility: "PUBLIC" },
    }),
    expect.objectContaining({
      actorUserId: user.id, action: "UPDATE_GAMEPLAY_SETTINGS", targetType: "LeagueSport", sport: "NFL",
      before: { draftSecondsPerPick: 60 }, after: { draftSecondsPerPick: 45 },
    }),
    expect.objectContaining({
      actorUserId: user.id, action: "UPDATE_DRAFT_ORDER", targetType: "LeagueSport", sport: "NFL",
      before: { draftOrder: [] }, after: { draftOrder: teams.map(({ id }) => id) },
    }),
  ]));
  await expect(database.commissionerAuditEvent.delete({ where: { id: events[0].id } })).rejects.toThrow(/append-only/i);
  expect(await listCommissionerAudit(randomUUID(), league.id)).toEqual([]);
  await database.league.delete({ where: { id: league.id } });
});
