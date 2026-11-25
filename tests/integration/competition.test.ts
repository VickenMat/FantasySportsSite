import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { getH2HChampionshipStandings } from "@/server/championships";
import { createLeague } from "@/server/league";
import { ensureRecordedDraw, provisionCompetitionSchedule } from "@/server/competition";
import { getCumulativeStandings, periodPublicationTime, scoreCapturedStarters } from "@/server/competition-scoring";
import { captureDueGameLineups, recordAvailabilityEvidence } from "@/server/lineup-snapshots";
import { advanceSportPlayoffs } from "@/server/playoffs";
import { recordPositionEvidence } from "@/server/positions";

const database = getDatabase();
afterAll(() => database.$disconnect());

describe("M4.2 persistent competition", () => {
  it("provisions independent NFL H2H periods through Week 17 and preserves an immutable config", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, { name: `M42 H2H ${randomUUID()}`, sports: ["NFL"], maxTeams: 6, historical: true, seasonYear: 2085, fillWithComputers: true });
    const leagueSport = await database.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: league.id, sport: "NFL" } } });
    const competition = await database.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id } });
    const gameIds: string[] = [];
    try {
      for (let week = 1; week <= 18; week++) {
        const game = await database.game.create({ data: { sport: "NFL", seasonId: leagueSport.seasonId, provider: "m42-fixture", externalId: randomUUID(), phase: "REGULAR", week,
          startsAt: new Date(Date.UTC(2085, 8, week * 7)) } }); gameIds.push(game.id);
      }
      const eligibleGameCount = await database.game.count({ where: { seasonId: leagueSport.seasonId, phase: "REGULAR", startsAt: { not: null }, week: { lte: 17 } } });
      await provisionCompetitionSchedule(user.id, competition.id);
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id } })).toBe(17);
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id, periodType: "PLAYOFF" } })).toBe(3);
      expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(42);
      expect(await database.competitionPeriodGame.count({ where: { sportCompetitionId: competition.id } })).toBe(eligibleGameCount);
      expect(await database.leagueGameAssignment.count({ where: { leagueId: league.id } })).toBe(eligibleGameCount);
      const config = await database.competitionConfigSnapshot.findFirstOrThrow({ where: { leagueId: league.id } });
      await expect(database.competitionConfigSnapshot.update({ where: { id: config.id }, data: { championPoints: 99 } })).rejects.toThrow(/append-only/i);
      const teams = await database.fantasyTeam.findMany({ where: { leagueId: league.id }, select: { id: true } });
      const first = await ensureRecordedDraw(league.id, "STANDINGS", competition.id, teams.map(({ id }) => id));
      const second = await ensureRecordedDraw(league.id, "STANDINGS", competition.id, teams.map(({ id }) => id));
      expect(second.map(({ randomToken }) => randomToken)).toEqual(first.map(({ randomToken }) => randomToken));
    } finally { await database.league.delete({ where: { id: league.id } }); await database.game.deleteMany({ where: { id: { in: gameIds } } }).catch(() => undefined); }
  });

  it("includes NFL Week 18 for cumulative competition and creates no matchups or playoffs", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, { name: `M42 Cumulative ${randomUUID()}`, sports: ["NFL"], maxTeams: 4, historical: true, seasonYear: 2086,
      fillWithComputers: true, competitionType: "CUMULATIVE" });
    const leagueSport = await database.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: league.id, sport: "NFL" } } });
    const competition = await database.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id }, include: { configSnapshot: true } });
    const gameIds: string[] = [];
    try {
      for (let week = 1; week <= 18; week++) {
        const game = await database.game.create({ data: { sport: "NFL", seasonId: leagueSport.seasonId, provider: "m42-fixture", externalId: randomUUID(), phase: "REGULAR", week,
          startsAt: new Date(Date.UTC(2086, 8, week * 7)) } }); gameIds.push(game.id);
      }
      await provisionCompetitionSchedule(user.id, competition.id);
      expect(competition.configSnapshot).toMatchObject({ playoffTeams: 0, playoffWeeks: 0 });
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id } })).toBe(18);
      expect(await database.scoringPeriod.count({ where: { competitionId: competition.id, periodType: "PLAYOFF" } })).toBe(0);
      expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(0);
    } finally { await database.league.delete({ where: { id: league.id } }); await database.game.deleteMany({ where: { id: { in: gameIds } } }).catch(() => undefined); }
  });

  it("advances a seeded six-team bracket with byes and persists all 12 sport placements and awards", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, {
      name: `M42 Bracket ${randomUUID()}`, sports: ["NFL"], maxTeams: 12, historical: true,
      seasonYear: 2084, fillWithComputers: true,
    });
    const competition = await database.sportCompetition.findFirstOrThrow({
      where: { leagueId: league.id }, include: { leagueSportSeason: true },
    });
    const now = new Date("2084-11-01T00:00:00Z");
    await database.game.createMany({ data: [1, 2, 3, 4].map((week) => ({
      sport: "NFL", seasonId: competition.leagueSportSeason.seasonId, provider: "m42-bracket",
      externalId: randomUUID(), phase: "REGULAR", week, startsAt: new Date(Date.UTC(2084, 8, week * 7)),
    })) });
    await provisionCompetitionSchedule(user.id, competition.id);
    expect(await advanceSportPlayoffs(user.id, competition.id, now)).toEqual({ status: "PENDING_REGULAR_RESULTS", created: 0 });
    const regular = await database.matchup.findMany({ where: { leagueId: league.id } });
    for (const [index, game] of regular.entries()) {
      await database.matchup.update({ where: { id: game.id }, data: {
        status: "FINAL", finalizedAt: now, homeTenths: BigInt(200 - index), awayTenths: BigInt(100 - index),
      } });
    }
    for (const round of [1, 2, 3]) {
      expect(await advanceSportPlayoffs(user.id, competition.id, now)).toEqual({ status: "SCHEDULED", created: round === 3 ? 6 : 4 });
      expect(await advanceSportPlayoffs(user.id, competition.id, now)).toEqual({ status: "PENDING_PLAYOFF_RESULTS", created: 0 });
      const games = await database.matchup.findMany({ where: { leagueId: league.id, playoffRound: round } });
      if (round === 1) {
        expect(games.find(({ bracketSlot }) => bracketSlot === "CHAMP-QF-A")).toMatchObject({ homeSeed: 3, awaySeed: 6 });
      }
      if (round === 2) {
        expect(games.find(({ bracketSlot }) => bracketSlot === "CHAMP-SF-A")).toMatchObject({ homeSeed: 1, awaySeed: 4 });
      }
      await database.matchup.updateMany({ where: { id: { in: games.map(({ id }) => id) } }, data: {
        status: "FINAL", finalizedAt: now, homeTenths: 100n, awayTenths: 90n,
      } });
    }
    expect(await advanceSportPlayoffs(user.id, competition.id, now)).toEqual({ status: "FINALIZED", created: 0 });
    expect(await advanceSportPlayoffs(user.id, competition.id, now)).toEqual({ status: "FINALIZED", created: 0 });
    const placements = await database.sportFinalPlacement.findMany({
      where: { sportCompetitionId: competition.id }, orderBy: { placement: "asc" },
    });
    expect(placements.map(({ placement }) => placement)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(placements[0]).toMatchObject({ initialSeed: 1, qualifiedForPlayoffs: true });
    const awards = await database.championshipPointAward.findMany({
      where: { sportCompetitionId: competition.id, teamId: placements[0].teamId },
    });
    expect(awards.reduce((total, award) => total + award.pointsNumerator / award.pointsDenominator, 0)).toBe(21);
    expect(awards.every(({ projected }) => !projected)).toBe(true);
    expect((await getH2HChampionshipStandings(league.id))?.championshipResults[0]).toMatchObject({
      teamId: placements[0].teamId, pointsNumerator: 21, pointsDenominator: 1, rank: 1, projected: true,
    });
    await database.league.delete({ where: { id: league.id } });
  });

  it("ranks sport and combined cumulative standings from captured starters and current ledger revisions", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
    const league = await createLeague(user.id, {
      name: `M42 Totals ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 2, historical: true,
      seasonYear: 2087, fillWithComputers: true, competitionType: "CUMULATIVE",
    });
    const teams = await database.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const now = new Date("2087-09-21T00:00:00Z");
    const startsAt = new Date("2087-09-20T20:00:00Z");
    const knownAt = new Date("2087-09-20T10:00:00Z");
    const scoredAt = new Date("2087-09-20T23:00:00Z");
    const scheduleBatch = await database.scheduleImportBatch.create({ data: {
      importerVersion: "fixture", bundleHash: randomUUID(), status: "COMPLETE", sourceManifest: {},
    } });
    const leagues = await database.leagueSport.findMany({ where: { leagueId: league.id } });
    const competitionBySport = await database.sportCompetition.findMany({ where: { leagueId: league.id } });

    async function setupSport(sport: "NBA" | "NFL") {
      const leagueSport = leagues.find((item) => item.sport === sport)!;
      const competition = competitionBySport.find((item) => item.sport === sport)!;
      const game = await database.game.create({ data: {
        sport, seasonId: leagueSport.seasonId, provider: "m42-totals", externalId: randomUUID(), phase: "REGULAR", week: 1, startsAt,
      } });
      await database.gameScheduleObservation.create({ data: {
        importBatchId: scheduleBatch.id, gameId: game.id, sport, phase: "REGULAR", gameDate: startsAt, startsAt,
        scheduleProvider: "m42-totals", scheduleExternalId: randomUUID(), gameKey: randomUUID(),
        status: "Final", source: "Official fixture", retrievedAt: scoredAt, contentHash: randomUUID(), sourceRecord: {},
      } });
      await provisionCompetitionSchedule(user.id, competition.id);
      const club = await database.proTeam.create({ data: {
        sport, provider: "m42-totals", externalId: randomUUID(), displayName: "Fixture club",
      } });
      await database.gameTeam.create({ data: { gameId: game.id, teamId: club.id } });
      const batch = await database.importBatch.create({ data: {
        sport, provider: "m42-totals", contentHash: randomUUID(), sourceName: "Fixture", importerVersion: "fixture", summary: {},
      } });
      return { sport, leagueSport, game, club, batch };
    }

    async function addPlayer(fixture: Awaited<ReturnType<typeof setupSport>>, teamId: string, slot: string) {
      const { sport, leagueSport, game, club, batch } = fixture;
      const player = await database.player.create({ data: { sport, displayName: "Cumulative fixture" } });
      const roster = await database.fantasyRoster.findUniqueOrThrow({
        where: { teamId_leagueSportId: { teamId, leagueSportId: leagueSport.id } },
      });
      const entry = await database.rosterEntry.create({ data: {
        leagueId: league.id, teamId, rosterId: roster.id, playerId: player.id, sport, seasonId: leagueSport.seasonId,
        slot, acquiredAt: knownAt,
      } });
      await database.rosterAssignmentEvent.create({ data: {
        leagueId: league.id, teamId, rosterEntryId: entry.id, toSlot: slot, toSlotIndex: 1, effectiveAt: knownAt,
        reason: "Fixture", idempotencyKey: randomUUID(),
      } });
      const role = sport === "NFL" ? "FOOTBALL" : "BASKETBALL";
      await recordPositionEvidence({
        playerId: player.id, seasonId: leagueSport.seasonId, code: sport === "NFL" ? "QB" : "PG",
        kind: "LISTED", effectiveAt: knownAt, knownAt, provider: "m42-totals", externalId: randomUUID(),
      });
      await recordAvailabilityEvidence({
        playerId: player.id, gameId: game.id, designation: "ACTIVE", irEligible: false, effectiveAt: knownAt, knownAt,
        provider: "m42-totals", externalId: randomUUID(), sourceRecord: {},
      });
      const stat = await database.playerGameStat.create({ data: {
        gameId: game.id, playerId: player.id, teamId: club.id, importBatchId: batch.id, provider: "m42-totals",
        role, revision: 1, contentHash: randomUUID(), sourceLine: 1, observedPositions: [], normalized: {}, raw: {},
        sourceKnownAt: scoredAt,
      } });
      const ledger = await database.scoreLedger.create({ data: {
        gameId: game.id, playerId: player.id, presetId: league.presetId, role,
      } });
      return { stat, ledger };
    }

    async function addScore(player: Awaited<ReturnType<typeof addPlayer>>, totalTenths: bigint, previousEntryId?: string) {
      return database.scoreLedgerEntry.create({ data: {
        ledgerId: player.ledger.id, statId: player.stat.id, sequence: previousEntryId ? 2 : 1, previousEntryId, totalTenths,
        reason: "Fixture", engineVersion: "fixture", ruleHash: "fixture", inputHash: randomUUID(),
        lineItems: [], missingStats: [], calculatedAt: previousEntryId ? now : scoredAt,
      } });
    }

    const nfl = await setupSport("NFL");
    const nba = await setupSport("NBA");
    const first = await addPlayer(nfl, teams[0].id, "QB");
    const second = await addPlayer(nba, teams[1].id, "PG");
    const benched = await addPlayer(nba, teams[0].id, "BENCH");
    expect(await getCumulativeStandings(league.id, {}, now)).toMatchObject({
      state: "PENDING_DATA", pendingGames: 2, rows: [{ rank: null }, { rank: null }],
    });
    expect(await captureDueGameLineups(now)).toMatchObject({ created: 3 });
    expect(await captureDueGameLineups(now)).toMatchObject({ created: 0 });
    const nflPeriod = await database.scoringPeriod.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    expect(await periodPublicationTime(database, nflPeriod.id, now)).toBeNull();
    await addScore(first, 71n);
    expect(await periodPublicationTime(database, nflPeriod.id, now)).toEqual(scoredAt);
    await addScore(benched, 999n);
    const original = await addScore(second, 60n);
    expect((await getCumulativeStandings(league.id, {}, scoredAt)).rows).toMatchObject([
      { id: teams[0].id, pointsFor: 71n, rank: 1 },
      { id: teams[1].id, pointsFor: 60n, rank: 2 },
    ]);
    await addScore(second, 91n, original.id);
    expect((await getCumulativeStandings(league.id, {}, now)).rows).toMatchObject([
      { id: teams[1].id, pointsFor: 91n, rank: 1 },
      { id: teams[0].id, pointsFor: 71n, rank: 2 },
    ]);
    expect((await getCumulativeStandings(league.id, { sport: "NFL" }, now)).rows[0])
      .toMatchObject({ id: teams[0].id, pointsFor: 71n, rank: 1 });

    const publishedLate = new Date("2087-09-22T00:00:00Z");
    const correctedStat = await database.playerGameStat.create({ data: {
      gameId: first.stat.gameId, playerId: first.stat.playerId, teamId: first.stat.teamId, importBatchId: first.stat.importBatchId,
      provider: first.stat.provider, role: first.stat.role, revision: 2, priorRevisionId: first.stat.id,
      contentHash: randomUUID(), sourceLine: 1, observedPositions: [], normalized: {}, raw: {}, sourceKnownAt: publishedLate,
    } });
    const nflOriginal = await database.scoreLedgerEntry.findFirstOrThrow({ where: { ledgerId: first.ledger.id } });
    await database.scoreLedgerEntry.create({ data: {
      ledgerId: first.ledger.id, statId: correctedStat.id, sequence: 2, previousEntryId: nflOriginal.id,
      totalTenths: 123n, reason: "Late fixture correction", engineVersion: "fixture", ruleHash: "fixture",
      inputHash: randomUUID(), lineItems: [], missingStats: [], calculatedAt: publishedLate,
    } });
    const cutoff = new Date("2087-09-21T23:00:00Z");
    expect(await scoreCapturedStarters(database, [nflPeriod.competitionId!], publishedLate, { publicationThrough: cutoff }))
      .toMatchObject([{ pointsFor: 71n }]);
    expect((await getCumulativeStandings(league.id, { sport: "NFL" }, publishedLate)).rows[0])
      .toMatchObject({ pointsFor: 123n });
    expect(await database.matchup.count({ where: { leagueId: league.id } })).toBe(0);
    expect(await database.championshipPointAward.count({ where: { sportCompetition: { leagueId: league.id } } })).toBe(0);
    await database.league.delete({ where: { id: league.id } });
  });
});
