import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { provisionCompetitionSchedule } from "@/server/competition";
import { recordAvailabilityEvidence } from "@/server/lineup-snapshots";
import { recordPositionEvidence } from "@/server/positions";
import { finalizeDueMatchups, recalculateMatchups } from "@/server/matchups";
import { correctPeriodScore } from "@/server/score-administration";
import { advanceSportPlayoffs } from "@/server/playoffs";
const db = getDatabase();
afterAll(() => db.$disconnect());

it("finalizes source-backed H2H results after 24 hours, advances the bracket and freezes the overall champion", async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(owner.id, { name: `H2H evidence fixture ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2082 });
  try {
    // Historical fixture creation is convenient; this test exercises the competitive source-evidence path.
    await db.league.update({ where: { id: league.id }, data: { isHistorical: false, isDemo: false } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const competition = await db.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const batch = await db.importBatch.create({ data: { sport: "NFL", provider: "isolated-h2h-publication", contentHash: randomUUID(), sourceName: "Synthetic official publication fixture", importerVersion: "fixture", summary: {} } });
    const schedule = await db.scheduleImportBatch.create({ data: { importerVersion: "fixture", bundleHash: randomUUID(), status: "COMPLETE", sourceManifest: { synthetic: true } } });
    const players = [];
    const knownAt = new Date("2082-08-01");
    for (const [index, team] of teams.entries()) {
      const player = await db.player.create({ data: { sport: "NFL", displayName: `H2H QB fixture ${index} ${randomUUID()}`, isSynthetic: true } });
      const club = await db.proTeam.create({ data: { sport: "NFL", provider: "isolated-h2h-publication", externalId: randomUUID(), displayName: `Synthetic club ${index}` } });
      const roster = await db.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: team.id, leagueSportId: sport.id } } });
      const entry = await db.rosterEntry.create({ data: { leagueId: league.id, teamId: team.id, playerId: player.id, rosterId: roster.id, sport: "NFL", seasonId: sport.seasonId, slot: "QB", acquiredAt: knownAt } });
      await db.rosterAssignmentEvent.create({ data: { leagueId: league.id, teamId: team.id, rosterEntryId: entry.id, toSlot: "QB", toSlotIndex: 1, effectiveAt: knownAt, reason: "Synthetic initial lineup", idempotencyKey: randomUUID() } });
      await recordPositionEvidence({ playerId: player.id, seasonId: sport.seasonId, code: "QB", kind: "LISTED", effectiveAt: knownAt, knownAt, provider: "isolated-h2h-publication", externalId: randomUUID() });
      players.push({ player, club });
    }
    const games = [];
    for (const [round, week] of [1, 17].entries()) {
      const startsAt = new Date(round ? "2082-12-27T18:00:00Z" : "2082-09-04T18:00:00Z");
      const publishedAt = new Date(+startsAt + 3 * 3600000);
      const game = await db.game.create({ data: { sport: "NFL", seasonId: sport.seasonId, provider: "isolated-h2h-publication", externalId: randomUUID(), phase: "REGULAR", week, startsAt } });
      await db.gameScheduleObservation.create({ data: { importBatchId: schedule.id, gameId: game.id, sport: "NFL", phase: "REGULAR", gameDate: startsAt, startsAt, scheduleProvider: "isolated-h2h-publication", scheduleExternalId: randomUUID(), gameKey: randomUUID(), status: "Final", source: "Explicit synthetic final-status fixture", retrievedAt: publishedAt, contentHash: randomUUID(), sourceRecord: { synthetic: true } } });
      for (const [index, { player, club }] of players.entries()) {
        await db.gameTeam.create({ data: { gameId: game.id, teamId: club.id, side: index ? "AWAY" : "HOME" } });
        await recordAvailabilityEvidence({ playerId: player.id, gameId: game.id, designation: "ACTIVE", irEligible: false, effectiveAt: knownAt, knownAt, provider: "isolated-h2h-publication", externalId: randomUUID(), sourceRecord: { synthetic: true } });
        const stat = await db.playerGameStat.create({ data: { gameId: game.id, playerId: player.id, teamId: club.id, importBatchId: batch.id, provider: "isolated-h2h-publication", role: "FOOTBALL", revision: 1, contentHash: randomUUID(), sourceLine: 1, observedPositions: ["QB"], normalized: {}, raw: {}, sourceKnownAt: publishedAt } });
        const ledger = await db.scoreLedger.create({ data: { gameId: game.id, playerId: player.id, presetId: league.presetId, role: "FOOTBALL" } });
        await db.scoreLedgerEntry.create({ data: { ledgerId: ledger.id, statId: stat.id, sequence: 1, totalTenths: round ? index ? 7n : 8n : index ? 5n : 10n, reason: "Synthetic source-backed score", engineVersion: "fixture", ruleHash: "fixture", inputHash: randomUUID(), lineItems: [], missingStats: [], calculatedAt: publishedAt } });
      }
      games.push({ game, publishedAt });
    }
    await provisionCompetitionSchedule(owner.id, competition.id);
    const regularDue = new Date(+games[0].publishedAt + 86400000);
    await recalculateMatchups(owner.id, league.id, "NFL", new Date(+regularDue - 1));
    const regular = await db.matchup.findFirstOrThrow({ where: { leagueId: league.id, isPlayoff: false } });
    const correction = { requestId: randomUUID(), periodId: regular.periodId, teamId: regular.homeTeamId, deltaTenths: 30, reason: "Explicit commissioner fixture scoring correction" };
    const correctionAt = new Date(+regularDue - 1);
    await expect(correctPeriodScore(randomUUID(), league.id, correction, correctionAt)).rejects.toThrow(/commissioner/);
    const event = await correctPeriodScore(owner.id, league.id, correction, correctionAt);
    expect((await correctPeriodScore(owner.id, league.id, correction, correctionAt)).id).toBe(event.id);
    await expect(correctPeriodScore(owner.id, league.id, { ...correction, deltaTenths: 40 }, correctionAt)).rejects.toThrow(/different terms/);
    await recalculateMatchups(owner.id, league.id, "NFL", correctionAt);
    expect((await db.matchup.findUniqueOrThrow({ where: { id: regular.id } })).homeTenths).toBe(regular.homeTenths + 30n);
    await correctPeriodScore(owner.id, league.id, { ...correction, requestId: randomUUID(), deltaTenths: -30, reason: "Compensating reversal preserves original correction" }, correctionAt);
    await recalculateMatchups(owner.id, league.id, "NFL", correctionAt);
    expect((await db.matchup.findUniqueOrThrow({ where: { id: regular.id } })).homeTenths).toBe(regular.homeTenths);
    expect(await db.scoreLedgerEntry.count({ where: { ledger: { gameId: { in: games.map(({ game }) => game.id) } } } })).toBe(4);
    await expect(db.commissionerAuditEvent.update({ where: { id: event.id }, data: { reason: "Rewrite" } })).rejects.toThrow(/append-only/);
    await finalizeDueMatchups(new Date(+regularDue - 1), league.id);
    expect(await db.matchup.count({ where: { leagueId: league.id, status: "FINAL" } })).toBe(0);
    await finalizeDueMatchups(regularDue, league.id);
    expect((await advanceSportPlayoffs(owner.id, competition.id, regularDue)).status).toBe("SCHEDULED");
    const finalDue = new Date(+games[1].publishedAt + 86400000);
    await recalculateMatchups(owner.id, league.id, "NFL", finalDue);
    await finalizeDueMatchups(finalDue, league.id);
    expect((await advanceSportPlayoffs(owner.id, competition.id, finalDue)).status).toBe("FINALIZED");
    const cycle = await db.championshipCycle.findFirstOrThrow({ where: { leagueId: league.id }, include: { championshipResults: { orderBy: { rank: "asc" } } } });
    expect(cycle.status).toBe("COMPLETE");
    await expect(correctPeriodScore(owner.id, league.id, { ...correction, requestId: randomUUID() }, finalDue)).rejects.toThrow(/frozen/);
    expect(cycle.championshipResults[0]).toMatchObject({ teamId: teams[0].id, rank: 1, pointsNumerator: 11, pointsDenominator: 1, combinedUbpTenths: 18n, projected: false });
    await advanceSportPlayoffs(owner.id, competition.id, new Date(+finalDue + 86400000));
    expect(await db.championshipResult.count({ where: { championshipCycleId: cycle.id } })).toBe(2);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
