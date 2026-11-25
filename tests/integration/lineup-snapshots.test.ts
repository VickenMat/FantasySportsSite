import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { captureGameLineups, recordAvailabilityEvidence } from "@/server/lineup-snapshots";
import { recordPositionEvidence } from "@/server/positions";

const database = getDatabase();
afterAll(() => database.$disconnect());

describe("M4.3 immutable game-start lineups", () => {
  it("captures a source-backed starter once and ignores later roster movement", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, { name: `M43 Snapshot ${randomUUID()}`, sports: ["NFL"], maxTeams: 4, historical: true, seasonYear: 2088, fillWithComputers: true });
    const leagueSport = await database.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: league.id, sport: "NFL" } } });
    const competition = await database.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    const team = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: user.id } });
    const roster = await database.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: team.id, leagueSportId: leagueSport.id } } });
    const playerId = randomUUID(); const startsAt = new Date(Date.now() - 60_000); const knownAt = new Date(startsAt.getTime() - 3_600_000);
    await database.player.create({ data: { id: playerId, sport: "NFL", displayName: "Snapshot Quarterback" } });
    const game = await database.game.create({ data: { sport: "NFL", seasonId: leagueSport.seasonId, provider: "m43-fixture", externalId: randomUUID(), phase: "REGULAR", week: 1, startsAt } });
    try {
      await recordPositionEvidence({ playerId, seasonId: leagueSport.seasonId, code: "QB", kind: "LISTED", effectiveAt: knownAt, knownAt, provider: "m43-fixture", externalId: randomUUID() });
      await recordAvailabilityEvidence({ playerId, gameId: game.id, designation: "ACTIVE", irEligible: false, effectiveAt: knownAt, knownAt,
        provider: "m43-fixture", externalId: randomUUID(), sourceRecord: { status: "confirmed active" } });
      const period = await database.scoringPeriod.create({ data: { leagueId: league.id, leagueSportId: leagueSport.id, competitionId: competition.id,
        sport: "NFL", number: 1, startsAt: new Date(startsAt.getTime() - 86_400_000), endsAt: new Date(startsAt.getTime() + 86_400_000) } });
      await database.competitionPeriodGame.create({ data: { sportCompetitionId: competition.id, scoringPeriodId: period.id, gameId: game.id } });
      const entry = await database.rosterEntry.create({ data: { leagueId: league.id, teamId: team.id, rosterId: roster.id, playerId, sport: "NFL",
        seasonId: leagueSport.seasonId, slot: "QB", slotIndex: 1, acquiredAt: knownAt } });
      await database.rosterAssignmentEvent.create({ data: { leagueId: league.id, teamId: team.id, rosterEntryId: entry.id, actorUserId: user.id,
        toSlot: "QB", toSlotIndex: 1, effectiveAt: knownAt, reason: "Fixture lineup", idempotencyKey: randomUUID() } });

      expect(await captureGameLineups(game.id)).toMatchObject({ status: "CAPTURED", created: 1 });
      expect(await captureGameLineups(game.id)).toMatchObject({ status: "CAPTURED", created: 0 });
      const snapshot = await database.gameLineupSnapshot.findFirstOrThrow({ where: { gameId: game.id, playerId } });
      expect(snapshot).toMatchObject({ slot: "QB", slotIndex: 1, isStarter: true, lockedAt: startsAt });

      const movedAt = new Date(startsAt.getTime() + 30_000);
      await database.$transaction([
        database.rosterEntry.update({ where: { id: entry.id }, data: { slot: "BENCH", slotIndex: 1 } }),
        database.rosterAssignmentEvent.create({ data: { leagueId: league.id, teamId: team.id, rosterEntryId: entry.id, actorUserId: user.id,
          fromSlot: "QB", fromSlotIndex: 1, toSlot: "BENCH", toSlotIndex: 1, effectiveAt: movedAt, reason: "Post-start move", idempotencyKey: randomUUID() } }),
      ]);
      expect(await database.gameLineupSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).toMatchObject({ slot: "QB", isStarter: true });
      await expect(database.gameLineupSnapshot.update({ where: { id: snapshot.id }, data: { slot: "BENCH" } })).rejects.toThrow(/append-only/i);
    } finally {
      await database.league.delete({ where: { id: league.id } });
      // The run's isolated schema owns the game and player, whose append-only
      // evidence prevents deleting either fixture individually.
    }
  });
});
