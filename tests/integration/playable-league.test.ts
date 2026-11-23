import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createDraft, makePick } from "@/server/draft";
import { createLeague } from "@/server/league";
import { generateSchedule } from "@/server/matchups";
import { processWaivers, submitWaiver } from "@/server/waivers";

const database = getDatabase();
afterAll(() => database.$disconnect());

it("serializes draft picks, prevents duplicate ownership and atomically processes FAAB", async () => {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const playerIds = Array.from({ length: 8 }, () => randomUUID());
  await database.player.createMany({ data: playerIds.map((id, index) => ({ id, sport: "NFL", displayName: `M3 Test Player ${index}` })) });
  const league = await createLeague(user.id, {
    name: `Integration ${randomUUID()}`, sport: "NFL", seasonYear: 2024, maxTeams: 4,
    format: "REDRAFT", startingFaab: 100, benchSlots: 2, historical: true, fillWithComputers: true,
  });
  try {
    const draft = await createDraft(user.id, league.id);
    await database.draft.update({ where: { id: draft.id }, data: { rounds: 1 } });
    const race = await Promise.allSettled([
      makePick({ userId: user.id, draftId: draft.id, playerId: playerIds[0], automatic: true }),
      makePick({ userId: user.id, draftId: draft.id, playerId: playerIds[0], automatic: true }),
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    for (const playerId of playerIds.slice(1, 4)) await makePick({ userId: user.id, draftId: draft.id, playerId, automatic: true });
    expect(await database.rosterEntry.count({ where: { leagueId: league.id } })).toBe(4);
    expect(await database.draft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "COMPLETE", currentPick: 4 });

    const commissioner = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: user.id }, include: { roster: true } });
    await submitWaiver(user.id, { leagueId: league.id, addPlayerId: playerIds[4], dropPlayerId: commissioner.roster[0].playerId, bid: 5 });
    expect(await processWaivers(user.id, league.id)).toBe(1);
    expect(await database.fantasyTeam.findUniqueOrThrow({ where: { id: commissioner.id } })).toMatchObject({ faabRemaining: 95 });
    expect(await database.rosterEntry.findUnique({ where: { leagueId_playerId: { leagueId: league.id, playerId: playerIds[4] } } })).toMatchObject({ teamId: commissioner.id });
    expect(await database.rosterEntry.findUnique({ where: { leagueId_playerId: { leagueId: league.id, playerId: commissioner.roster[0].playerId } } })).toBeNull();

    await generateSchedule(user.id, league.id, 3);
    expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(6);
  } finally {
    await database.league.delete({ where: { id: league.id } });
    await database.player.deleteMany({ where: { id: { in: playerIds } } });
  }
});
