import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { recordAvailabilityEvidence } from "@/server/lineup-snapshots";
import { addFreeAgent, dropPlayer, setLineupSlot } from "@/server/rosters";
import { cancelWaiver, processWaivers, reservedSportFaab, submitWaiver } from "@/server/waivers";

const database = getDatabase();
afterAll(() => database.$disconnect());

async function fixture() {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, {
    name: `M43 Waivers ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 2, fillWithComputers: true,
    historical: true, seasonYear: 2087,
  });
  const roster = await database.fantasyRoster.findFirstOrThrow({
    where: { leagueId: league.id, sport: "NFL", team: { managerId: user.id } },
  });
  const playerIds = Array.from({ length: 4 }, () => randomUUID());
  await database.player.createMany({ data: playerIds.map((id, index) => ({
    id, sport: index === 3 ? "NBA" : "NFL", displayName: "M4.3 acquisition fixture",
  })) });
  return { user, league, roster, playerIds };
}

it("holds released players for 24 hours and reserves sealed bids without allowing concurrent overspend", async () => {
  const { user, league, roster, playerIds: [released, first, second, basketball] } = await fixture();
  const original = await addFreeAgent(user.id, league.id, released, "NFL");
  await dropPlayer(user.id, league.id, released, "NFL");
  const { releasedAt } = await database.rosterEntry.findUniqueOrThrow({ where: { id: original.id } });
  await expect(addFreeAgent(user.id, league.id, released, "NFL")).rejects.toThrow(/release waivers/i);
  const claim = (playerId: string, bid: number, sport = "NFL") =>
    submitWaiver(user.id, { leagueId: league.id, sport, addPlayerId: playerId, bid });

  const held = await claim(released, 60);
  expect(held.processAt.getTime()).toBe(releasedAt!.getTime() + 86_400_000);
  expect(await reservedSportFaab(database, roster.id)).toBe(60);
  await expect(claim(first, 50)).rejects.toThrow(/unreserved sport FAAB/i);
  const nba = await claim(basketball, 100, "NBA");
  await cancelWaiver(user.id, nba.id);
  await cancelWaiver(user.id, held.id);
  expect(await reservedSportFaab(database, roster.id)).toBe(0);

  const competingBids = await Promise.allSettled([claim(first, 70), claim(second, 70)]);
  expect(competingBids.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(await reservedSportFaab(database, roster.id)).toBe(70);
  expect(await processWaivers(user.id, league.id)).toBe(1);
  expect(await reservedSportFaab(database, roster.id)).toBe(0);
  expect(await database.fantasyRoster.findUniqueOrThrow({ where: { id: roster.id } })).toMatchObject({ faabRemaining: 30 });
  const finalClaim = await claim(released, 30);
  expect(await processWaivers(user.id, league.id, new Date(finalClaim.processAt.getTime() - 1))).toBe(0);
  expect(await processWaivers(user.id, league.id, finalClaim.processAt)).toBe(1);
  expect(await processWaivers(user.id, league.id, finalClaim.processAt)).toBe(0);
  expect(await database.fantasyRoster.findUniqueOrThrow({ where: { id: roster.id } })).toMatchObject({ faabRemaining: 0 });
  await database.league.delete({ where: { id: league.id } });
});

it("uses the latest verified IR designation and blocks acquisition until the roster is corrected", async () => {
  const { user, league, playerIds: [injured, available] } = await fixture();
  const athlete = await addFreeAgent(user.id, league.id, injured, "NFL");
  await expect(setLineupSlot(user.id, league.id, athlete.id, "UNIVERSAL_IR", "NFL")).rejects.toThrow(/source-backed IR eligibility/i);
  const report = {
    playerId: injured, provider: "m43-ir-fixture", sourceRecord: {},
  };
  const first = new Date(Date.now() - 60_000);
  await recordAvailabilityEvidence({
    ...report, knownAt: first, effectiveAt: first, externalId: randomUUID(), designation: "INJURED_RESERVE", irEligible: true,
  });
  await expect(setLineupSlot(user.id, league.id, athlete.id, "UNIVERSAL_IR", "NFL")).resolves.toMatchObject({ slot: "UNIVERSAL_IR" });
  const second = new Date(Date.now() - 1000);
  await recordAvailabilityEvidence({
    ...report, knownAt: second, effectiveAt: second, externalId: randomUUID(), designation: "ACTIVE", irEligible: false,
  });
  await expect(addFreeAgent(user.id, league.id, available, "NFL")).rejects.toThrow(/noncompliance/i);
  await expect(submitWaiver(user.id, { leagueId: league.id, sport: "NFL", addPlayerId: available, bid: 1 })).rejects.toThrow(/noncompliance/i);
  await expect(setLineupSlot(user.id, league.id, athlete.id, "BENCH", "NFL")).resolves.toMatchObject({ slot: "BENCH" });
  await expect(addFreeAgent(user.id, league.id, available, "NFL")).resolves.toMatchObject({ playerId: available });
  await database.league.delete({ where: { id: league.id } });
});

it("moves and swaps exact shared slot indexes without changing either player's sport roster", async () => {
  const { user, league, playerIds: [football, anotherFootball, , basketball] } = await fixture();
  const nfl = await addFreeAgent(user.id, league.id, football, "NFL");
  const nba = await addFreeAgent(user.id, league.id, basketball, "NBA");
  await expect(setLineupSlot(user.id, league.id, nfl.id, "UNIVERSAL_BENCH", "NFL", null, 3))
    .resolves.toMatchObject({ slot: "UNIVERSAL_BENCH", slotIndex: 3 });
  await expect(setLineupSlot(user.id, league.id, nba.id, "UNIVERSAL_BENCH", "NBA", null, 4))
    .resolves.toMatchObject({ slot: "UNIVERSAL_BENCH", slotIndex: 4 });
  await expect(setLineupSlot(user.id, league.id, nfl.id, "UNIVERSAL_BENCH", "NFL", nba.id, 4))
    .resolves.toMatchObject({ sport: "NFL", rosterId: nfl.rosterId, slotIndex: 4 });
  expect(await database.rosterEntry.findUniqueOrThrow({ where: { id: nba.id } }))
    .toMatchObject({ sport: "NBA", rosterId: nba.rosterId, slot: "UNIVERSAL_BENCH", slotIndex: 3 });

  const alternate = await addFreeAgent(user.id, league.id, anotherFootball, "NFL");
  await expect(setLineupSlot(user.id, league.id, alternate.id, "UNIVERSAL_BENCH", "NFL", nba.id, 3))
    .rejects.toThrow(/sport-specific position/i);
  await expect(setLineupSlot(user.id, league.id, alternate.id, "UNIVERSAL_BENCH", "NFL", null, 3))
    .rejects.toThrow(/position changed/i);
  expect(await database.rosterEntry.findUniqueOrThrow({ where: { id: alternate.id } })).toMatchObject({ slot: "BENCH" });
  await database.league.delete({ where: { id: league.id } });
});
