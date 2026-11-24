import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { createDraft, makePick } from "@/server/draft";
import { createLeague, joinPublicLeague, leagueContext, listPublicLeagues, resizeLeague, selectKeeper, transitionSportSeason, updateDraftOrder, updateLeagueSettings } from "@/server/league";
import { generateSchedule, standings } from "@/server/matchups";
import { cancelTrade, proposeTrade, respondToTrade } from "@/server/trades";

const database = getDatabase();
afterAll(() => database.$disconnect());

describe("M3.6 persistent multi-sport leagues", () => {
  it("persists all 15 sport combinations as one franchise with separate rosters", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const sports = ["NFL", "NBA", "MLB", "NHL"] as const; const ids: string[] = [];
    try {
      for (let mask = 1; mask < 16; mask++) {
        const selected = sports.filter((_, index) => mask & (1 << index)) as Sport[];
        const league = await createLeague(user.id, { name: `Combination ${mask} ${randomUUID()}`, sports: selected, maxTeams: 2 }); ids.push(league.id);
        expect(await database.leagueSport.count({ where: { leagueId: league.id } })).toBe(selected.length);
        expect(await database.fantasyRoster.count({ where: { leagueId: league.id } })).toBe(selected.length);
        expect(await database.fantasyTeam.count({ where: { leagueId: league.id } })).toBe(1);
      }
    } finally { await database.league.deleteMany({ where: { id: { in: ids } } }); }
  });

  it("persists every capacity from 2 through 16 and safely resizes a 2-of-12 league", async () => {
    const commissioner = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const secondId = randomUUID(); const ids: string[] = [];
    await database.user.create({ data: { id: secondId, name: "Resize Manager", email: `resize-${secondId}@example.test` } });
    try {
      for (let maxTeams = 2; maxTeams <= 16; maxTeams++) {
        const league = await createLeague(commissioner.id, { name: `Capacity ${maxTeams} ${randomUUID()}`, sports: ["NFL"], maxTeams }); ids.push(league.id);
        expect(league.maxTeams).toBe(maxTeams);
      }
      const existing = await createLeague(commissioner.id, { name: `Existing 2 of 12 ${randomUUID()}`, sports: ["NFL"], maxTeams: 12, visibility: "PUBLIC" }); ids.push(existing.id);
      await joinPublicLeague(secondId, existing.id); await resizeLeague(commissioner.id, existing.id, 2);
      expect(await database.league.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ maxTeams: 2 });
      await expect(resizeLeague(commissioner.id, existing.id, 1)).rejects.toThrow();
    } finally { await database.league.deleteMany({ where: { id: { in: ids } } }); await database.user.delete({ where: { id: secondId } }); }
  });

  it("isolates sport drafts, ownership, keepers, transitions, schedules, and authorization", async () => {
    const commissioner = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } }); const outsiderId = randomUUID();
    await database.user.create({ data: { id: outsiderId, name: "Public Manager", email: `public-${outsiderId}@example.test` } });
    const playerIds = Array.from({ length: 8 }, () => randomUUID());
    await database.player.createMany({ data: playerIds.map((id, index) => ({ id, sport: index < 4 ? "NFL" : "NBA", displayName: `M36 Player ${index}`, isDemo: true })) });
    const league = await createLeague(commissioner.id, { name: `M36 Gameplay ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 2, format: "REDRAFT", visibility: "PUBLIC", keeperLimits: { NFL: 1, NBA: 0 }, fillWithComputers: true });
    try {
      expect((await listPublicLeagues(outsiderId)).some(({ id }) => id === league.id)).toBe(true);
      await joinPublicLeague(outsiderId, league.id);
      expect(await database.fantasyTeam.count({ where: { leagueId: league.id } })).toBe(2);
      expect(await database.fantasyRoster.count({ where: { leagueId: league.id } })).toBe(4);
      expect(await database.fantasyTeam.count({ where: { leagueId: league.id, isComputer: true } })).toBe(0);
      const teams = await database.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
      await updateLeagueSettings(commissioner.id, league.id, { sport: "NFL", draftRounds: 1, draftSecondsPerPick: 90, startingFaab: 100, playoffTeams: 2, playoffPeriods: 2, visibility: "PUBLIC", maxTeams: 2, keeperLimit: 1, keeperDeadline: new Date(Date.now() + 86_400_000) });
      await updateDraftOrder(commissioner.id, league.id, "NFL", teams.map(({ id }) => id).reverse());

      const nflDraft = await createDraft(commissioner.id, league.id, "NFL");
      expect(nflDraft.order).toEqual(teams.map(({ id }) => id).reverse());
      await expect(makePick({ userId: commissioner.id, draftId: nflDraft.id, playerId: playerIds[4], automatic: true })).rejects.toThrow(/Only NFL/i);
      await makePick({ userId: commissioner.id, draftId: nflDraft.id, playerId: playerIds[0], automatic: true });
      await makePick({ userId: commissioner.id, draftId: nflDraft.id, playerId: playerIds[1], automatic: true });

      await updateLeagueSettings(commissioner.id, league.id, { sport: "NBA", draftRounds: 1, draftSecondsPerPick: 90, startingFaab: 100, playoffTeams: 2, playoffPeriods: 2, visibility: "PUBLIC", maxTeams: 2, keeperLimit: 0, keeperDeadline: null });
      const nbaDraft = await createDraft(commissioner.id, league.id, "NBA");
      await makePick({ userId: commissioner.id, draftId: nbaDraft.id, playerId: playerIds[4], automatic: true });
      await makePick({ userId: commissioner.id, draftId: nbaDraft.id, playerId: playerIds[5], automatic: true });
      expect(await database.rosterEntry.count({ where: { leagueId: league.id, sport: "NFL", releasedAt: null } })).toBe(2);
      expect(await database.rosterEntry.count({ where: { leagueId: league.id, sport: "NBA", releasedAt: null } })).toBe(2);

      const commissionerTeam = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: commissioner.id } });
      const retained = await database.rosterEntry.findFirstOrThrow({ where: { leagueId: league.id, teamId: commissionerTeam.id, sport: "NFL", releasedAt: null } });
      await selectKeeper(commissioner.id, league.id, "NFL", retained.playerId);
      const nfl = await database.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: league.id, sport: "NFL" } }, include: { season: true } });
      await transitionSportSeason(commissioner.id, league.id, "NFL", (nfl.season?.startYear ?? 2026) + 1);
      expect(await database.rosterEntry.findFirst({ where: { leagueId: league.id, sport: "NFL", playerId: retained.playerId, releasedAt: null } })).not.toBeNull();
      expect(await database.rosterEntry.count({ where: { leagueId: league.id, sport: "NBA", releasedAt: null } })).toBe(2);

      await generateSchedule(commissioner.id, league.id, 3, "NFL");
      expect(await database.matchup.count({ where: { leagueId: league.id, sport: "NFL" } })).toBe(3);
      expect(await standings(league.id, "NFL")).toHaveLength(2);
      expect(await leagueContext(randomUUID(), league.id)).toBeNull();
      await expect(resizeLeague(outsiderId, league.id, 2)).rejects.toThrow(/commissioner/i);
    } finally { await database.league.delete({ where: { id: league.id } }); await database.player.deleteMany({ where: { id: { in: playerIds } } }); await database.user.delete({ where: { id: outsiderId } }); }
  });

  it("fills a twelve-team league with two humans and ten computer franchises and schedules odd leagues", async () => {
    const commissioner = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } }); const secondId = randomUUID();
    await database.user.create({ data: { id: secondId, name: "Second Human", email: `human-${secondId}@example.test` } });
    const full = await createLeague(commissioner.id, { name: `Bots 12 ${randomUUID()}`, sports: ["NHL"], maxTeams: 12, visibility: "PUBLIC", fillWithComputers: true });
    const odd = await createLeague(commissioner.id, { name: `Odd 3 ${randomUUID()}`, sports: ["MLB"], maxTeams: 3, fillWithComputers: true });
    try {
      await joinPublicLeague(secondId, full.id);
      expect(await database.fantasyTeam.count({ where: { leagueId: full.id } })).toBe(12);
      expect(await database.fantasyTeam.count({ where: { leagueId: full.id, isComputer: true } })).toBe(10);
      expect(await database.fantasyTeam.count({ where: { leagueId: full.id, managerId: { not: null } } })).toBe(2);
      await generateSchedule(commissioner.id, odd.id, 3, "MLB");
      expect(await database.matchup.count({ where: { leagueId: odd.id, sport: "MLB" } })).toBe(3);
    } finally { await database.league.deleteMany({ where: { id: { in: [full.id, odd.id] } } }); await database.user.delete({ where: { id: secondId } }); }
  });

  it("atomically exchanges assets across all four sports and preserves cancellation", async () => {
    const commissioner = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const partnerId = randomUUID();
    await database.user.create({ data: { id: partnerId, name: "Cross Sport Partner", email: `cross-${partnerId}@example.test` } });
    const league = await createLeague(commissioner.id, { name: `Cross Sport ${randomUUID()}`, sports: ["NFL", "NBA", "MLB", "NHL"], maxTeams: 2, visibility: "PUBLIC", fillWithComputers: true });
    const playerIds = Array.from({ length: 8 }, () => randomUUID());
    const sportOrder = ["NFL", "NBA", "MLB", "NHL"] as const;
    await database.player.createMany({ data: playerIds.map((id, index) => ({ id, sport: sportOrder[index % 4], displayName: `Cross Asset ${index}`, isDemo: true })) });
    try {
      await joinPublicLeague(partnerId, league.id);
      const teams = await database.fantasyTeam.findMany({ where: { leagueId: league.id }, include: { sportRosters: { include: { leagueSport: true } } } });
      const proposer = teams.find(({ managerId }) => managerId === commissioner.id)!;
      const recipient = teams.find(({ managerId }) => managerId === partnerId)!;
      for (let index = 0; index < playerIds.length; index++) {
        const team = index < 4 ? proposer : recipient;
        const sport = sportOrder[index % 4];
        const roster = team.sportRosters.find((value) => value.sport === sport)!;
        await database.rosterEntry.create({ data: { leagueId: league.id, teamId: team.id, rosterId: roster.id, playerId: playerIds[index], sport, seasonId: roster.leagueSport.seasonId, slot: "BENCH" } });
      }
      const trade = await proposeTrade(commissioner.id, { leagueId: league.id, recipientTeamId: recipient.id, offerPlayerIds: playerIds.slice(0, 4), requestPlayerIds: playerIds.slice(4, 8) });
      expect(new Set(trade.assets.map(({ sport }) => sport))).toEqual(new Set(sportOrder));
      expect(trade).toMatchObject({ sport: null, leagueSportId: null, status: "PENDING" });
      await expect(respondToTrade(commissioner.id, trade.id, "ACCEPT")).rejects.toThrow(/recipient/i);
      const accepted = await respondToTrade(partnerId, trade.id, "ACCEPT");
      expect(accepted.status).toBe("ACCEPTED");
      expect(await database.rosterEntry.count({ where: { leagueId: league.id, teamId: recipient.id, playerId: { in: playerIds.slice(0, 4) }, releasedAt: null } })).toBe(4);
      expect(await database.rosterEntry.count({ where: { leagueId: league.id, teamId: proposer.id, playerId: { in: playerIds.slice(4, 8) }, releasedAt: null } })).toBe(4);
      expect(await database.fantasyTransaction.count({ where: { leagueId: league.id, type: "TRADE", note: { contains: trade.id } } })).toBe(8);

      const cancelled = await proposeTrade(commissioner.id, { leagueId: league.id, recipientTeamId: recipient.id, offerPlayerIds: [playerIds[4]], requestPlayerIds: [playerIds[0]] });
      await cancelTrade(commissioner.id, cancelled.id);
      await expect(respondToTrade(partnerId, cancelled.id, "ACCEPT")).rejects.toThrow(/no longer pending/i);
      expect(await database.rosterEntry.findFirstOrThrow({ where: { leagueId: league.id, playerId: playerIds[4], releasedAt: null } })).toMatchObject({ teamId: proposer.id });
    } finally {
      await database.league.delete({ where: { id: league.id } });
      await database.player.deleteMany({ where: { id: { in: playerIds } } });
      await database.user.delete({ where: { id: partnerId } });
    }
  });
});
