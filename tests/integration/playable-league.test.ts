import "dotenv/config";
import { installDraftBoundaryFixtures } from "../helpers/professional-boundaries";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { autoPickExpiredDraft, changeQueue, createDraft, makePick, queuePlayer, reorderQueue, setDraftPaused } from "@/server/draft";
import { createLeague } from "@/server/league";
import { ensureRelativeMatchupSchedule, generateNextPlayoffRound, generateSchedule, standings } from "@/server/matchups";
import { processWaivers, submitWaiver } from "@/server/waivers";
import { proposeTrade, respondToTrade } from "@/server/trades";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { dropPlayer } from "@/server/rosters";

const database = getDatabase();
afterAll(() => database.$disconnect());

it("serializes draft picks, prevents duplicate ownership and atomically processes FAAB", async () => {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const playerIds = Array.from({ length: 8 }, () => randomUUID());
  await database.player.createMany({ data: playerIds.map((id, index) => ({ id, sport: "NFL", displayName: `M3 Test Player ${index}`, isDemo: true })) });
  const league = await createLeague(user.id, {
    name: `Integration ${randomUUID()}`, sport: "NFL", seasonYear: 2024, maxTeams: 4,
    format: "REDRAFT", startingFaab: 100, benchSlots: 2, historical: true, fillWithComputers: true,
  });
  try {
    const draft = await createDraft(user.id, league.id);
    await database.draft.update({ where: { id: draft.id }, data: { rounds: 1, pickOrder: draft.pickOrder.slice(0, 4) } });
    const race = await Promise.allSettled([
      makePick({ userId: user.id, draftId: draft.id, playerId: playerIds[0], automatic: true }),
      makePick({ userId: user.id, draftId: draft.id, playerId: playerIds[0], automatic: true }),
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    for (const playerId of playerIds.slice(1, 4)) await makePick({ userId: user.id, draftId: draft.id, playerId, automatic: true });
    expect(await database.rosterEntry.count({ where: { leagueId: league.id } })).toBe(4);
    expect(await database.draft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "COMPLETE", currentPick: 4 });
    const leagueSport = await database.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    expect(await database.relativeMatchupPeriod.count({ where: { leagueSportId: leagueSport.id } })).toBe(14);
    expect(await database.relativeMatchup.count({ where: { period: { leagueSportId: leagueSport.id } } })).toBe(28);
    await database.$transaction((tx) => ensureRelativeMatchupSchedule(tx, {
      leagueId: league.id, leagueSportId: leagueSport.id, sport: "NFL", periods: 14,
    }));
    expect(await database.relativeMatchup.count({ where: { period: { leagueSportId: leagueSport.id } } })).toBe(28);

    const commissioner = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: user.id }, include: { roster: true } });
    await submitWaiver(user.id, { leagueId: league.id, addPlayerId: playerIds[4], dropPlayerId: commissioner.roster[0].playerId, bid: 5 });
    expect(await processWaivers(user.id, league.id)).toBe(1);
    expect(await database.fantasyRoster.findFirstOrThrow({ where: { teamId: commissioner.id, sport: "NFL" } })).toMatchObject({ faabRemaining: 95 });
    expect(await database.rosterEntry.findFirst({ where: { leagueId: league.id, playerId: playerIds[4], releasedAt: null } })).toMatchObject({ teamId: commissioner.id });
    expect(await database.rosterEntry.findFirst({ where: { leagueId: league.id, playerId: commissioner.roster[0].playerId, releasedAt: null } })).toBeNull();

    await generateSchedule(user.id, league.id, 3);
    expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(6);
  } finally {
    await database.league.delete({ where: { id: league.id } });
    await database.player.deleteMany({ where: { id: { in: playerIds } } });
  }
});

it("persists draft clocks, executes accepted trades, seeds playoffs and enforces rate buckets", async () => {
  const commissioner = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const otherUserId = randomUUID();
  const otherEmail = `trade-${randomUUID()}@example.test`;
  await database.user.create({ data: { id: otherUserId, name: "Trade Manager", email: otherEmail } });
  const playerIds = Array.from({ length: 10 }, () => randomUUID());
  await database.player.createMany({ data: playerIds.map((id, index) => ({ id, sport: "NBA", displayName: `Clock Player ${index}`, isDemo: true })) });
  const league = await createLeague(commissioner.id, {
    name: `Clock ${randomUUID()}`, sport: "NBA", seasonYear: 2024, maxTeams: 4, format: "REDRAFT",
    startingFaab: 100, benchSlots: 2, historical: true, fillWithComputers: true,
  });
  const timerLeague = await createLeague(commissioner.id, {
    name: `Timer ${randomUUID()}`, sport: "NBA", seasonYear: 2024, maxTeams: 4, format: "REDRAFT",
    startingFaab: 100, benchSlots: 2, historical: false, fillWithComputers: true,
  });
  try {
    const recipient = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, isComputer: true }, orderBy: { draftSlot: "asc" } });
    const membership = await database.leagueMember.create({ data: { leagueId: league.id, userId: otherUserId } });
    await database.fantasyTeam.update({ where: { id: recipient.id }, data: { managerId: otherUserId, membershipId: membership.id, isComputer: false } });
    const draft = await createDraft(commissioner.id, league.id);
    await database.draft.update({ where: { id: draft.id }, data: { rounds: 1, pickOrder: draft.pickOrder.slice(0, 4) } });
    for (const playerId of playerIds.slice(0, 4)) await makePick({ userId: commissioner.id, draftId: draft.id, playerId, automatic: true });
    const proposer = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: commissioner.id }, include: { roster: true } });
    const recipientAfter = await database.fantasyTeam.findUniqueOrThrow({ where: { id: recipient.id }, include: { roster: true } });
    await expect(dropPlayer(otherUserId, league.id, proposer.roster[0].playerId)).rejects.toThrow(/not on your active sport roster/i);
    const trade = await proposeTrade(commissioner.id, {
      leagueId: league.id, recipientTeamId: recipient.id, offerPlayerIds: [proposer.roster[0].playerId],
      requestPlayerIds: [recipientAfter.roster[0].playerId], message: "one for one", expiresInHours: 24,
    });
    await expect(respondToTrade(commissioner.id, trade.id, "ACCEPT")).rejects.toThrow(/recipient/i);
    const acceptance = await Promise.allSettled([respondToTrade(otherUserId, trade.id, "ACCEPT"), respondToTrade(otherUserId, trade.id, "ACCEPT")]);
    expect(acceptance.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await database.rosterEntry.findFirstOrThrow({ where: { leagueId: league.id, playerId: proposer.roster[0].playerId, releasedAt: null } })).toMatchObject({ teamId: recipient.id });
    expect(await database.rosterEntry.findFirstOrThrow({ where: { leagueId: league.id, playerId: recipientAfter.roster[0].playerId, releasedAt: null } })).toMatchObject({ teamId: proposer.id });

    await generateSchedule(commissioner.id, league.id, 1);
    const games = await database.matchup.findMany({ where: { leagueId: league.id }, orderBy: { id: "asc" } });
    for (const [index, game] of games.entries()) await database.matchup.update({ where: { id: game.id }, data: { status: "FINAL", homeTenths: BigInt(1000 - index), awayTenths: BigInt(500 + index) } });
    const table = await standings(league.id);
    expect(table[0].wins).toBeGreaterThanOrEqual(table.at(-1)!.wins);
    await generateNextPlayoffRound(commissioner.id, league.id);
    expect(await database.matchup.count({ where: { leagueId: league.id, isPlayoff: true, playoffRound: 1 } })).toBe(2);

    await installDraftBoundaryFixtures(timerLeague.id);
    const timed = await createDraft(commissioner.id, timerLeague.id);
    const firstQueue = await queuePlayer(commissioner.id, timed.id, playerIds[4]); const secondQueue = await queuePlayer(commissioner.id, timed.id, playerIds[5]);
    await changeQueue(commissioner.id, timed.id, secondQueue.id, "UP");
    expect((await database.draftQueueEntry.findMany({ where: { draftId: timed.id }, orderBy: { rank: "asc" } }))[0].id).toBe(secondQueue.id);
    await reorderQueue(commissioner.id, timed.id, [firstQueue.id, secondQueue.id]);
    expect(await database.draftQueueEntry.findMany({ where: { draftId: timed.id }, orderBy: { rank: "asc" }, select: { id: true } })).toEqual([{ id: firstQueue.id }, { id: secondQueue.id }]);
    await reorderQueue(commissioner.id, timed.id, [secondQueue.id, firstQueue.id]);
    await database.draft.update({ where: { id: timed.id }, data: { rounds: 1, pickOrder: timed.pickOrder.slice(0, 4), secondsPerPick: 15, pickStartedAt: new Date(Date.now() - 20_000), pickDeadlineAt: new Date(Date.now() - 5_000) } });
    expect(await autoPickExpiredDraft(timed.id)).not.toBeNull();
    expect(await database.draftPick.findFirst({ where: { draftId: timed.id, overall: 1 } })).toMatchObject({ playerId: playerIds[5], automatic: true });
    await setDraftPaused(commissioner.id, timed.id, true);
    const paused = await database.draft.findUniqueOrThrow({ where: { id: timed.id } });
    expect(paused.pausedRemainingMs).toBeGreaterThan(14_000); expect(paused.pickDeadlineAt).toBeNull();
    expect(await autoPickExpiredDraft(timed.id, new Date(Date.now() + 60_000))).toBeNull();
    await setDraftPaused(commissioner.id, timed.id, false);
    const resumed = await database.draft.findUniqueOrThrow({ where: { id: timed.id } });
    expect(resumed).toMatchObject({ status: "ACTIVE", pausedAt: null, pausedRemainingMs: null });
    expect(resumed.pickDeadlineAt!.getTime() - Date.now()).toBeGreaterThan(13_000);
    expect(firstQueue.id).not.toBe(secondQueue.id);

    const identity = randomUUID(); const now = new Date("2099-01-01T00:00:00Z");
    await enforceRateLimit(identity, "integration", 2, 60_000, now);
    await enforceRateLimit(identity, "integration", 2, 60_000, now);
    await expect(enforceRateLimit(identity, "integration", 2, 60_000, now)).rejects.toBeInstanceOf(RateLimitError);
  } finally {
    await database.league.deleteMany({ where: { id: { in: [league.id, timerLeague.id] } } });
    await database.user.delete({ where: { id: otherUserId } });
    await database.player.deleteMany({ where: { id: { in: playerIds } } });
  }
});
