import type { Matchup, Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { rankH2HStandings, roundRobinPairings, summarizeH2H } from "./competition";
import { periodPublicationTime, scoreCapturedStarters } from "./competition-scoring";
import { resolveLeagueSport } from "./league";
import { captureDueGameLineups } from "./lineup-snapshots";

export { roundRobinPairings } from "./competition";

export async function ensureRelativeMatchupSchedule(tx: Prisma.TransactionClient, input: {
  leagueId: string; leagueSportId: string; sport: Sport; periods: number;
}) {
  const league = await tx.league.findUniqueOrThrow({ where: { id: input.leagueId }, select: {
    competitionType: true, teams: { orderBy: [{ draftSlot: "asc" }, { id: "asc" }], select: { id: true } },
  } });
  if (league.competitionType === "CUMULATIVE") return { periods: 0, matchups: 0 };
  const pairings = roundRobinPairings(league.teams.map(({ id }) => id), input.periods);
  for (let number = 1; number <= input.periods; number++) {
    const period = await tx.relativeMatchupPeriod.upsert({
      where: { leagueSportId_number: { leagueSportId: input.leagueSportId, number } }, update: {},
      create: { leagueId: input.leagueId, leagueSportId: input.leagueSportId, sport: input.sport, number },
    });
    await tx.relativeMatchup.createMany({ data: pairings.filter(({ round }) => round === number).map((pairing) => ({
      periodId: period.id, homeTeamId: pairing.homeTeamId, awayTeamId: pairing.awayTeamId,
    })), skipDuplicates: true });
  }
  return { periods: input.periods, matchups: pairings.length };
}

export async function generateSchedule(userId: string, leagueId: string, periods = 14, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { teams: { orderBy: { draftSlot: "asc" } } } } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can generate the schedule.");
  if (member.league.competitionType === "CUMULATIVE") throw new Error("Cumulative leagues use source-backed scoring periods.");
  if (!member.league.isHistorical) throw new Error("Competitive schedules require authoritative UTC professional games; use source-backed competition provisioning.");
  const teams = member.league.teams.map(({ id }) => id); const pairings = roundRobinPairings(teams, periods);
  return database.$transaction(async (tx) => {
    if (await tx.scoringPeriod.count({ where: { leagueId, sport: leagueSport.sport } })) throw new Error(`A ${leagueSport.sport} schedule already exists.`);
    const seasonStart = new Date(Date.UTC(leagueSport.season?.startYear ?? member.league.seasonYear, leagueSport.sport === "NFL" ? 8 : 0, 1));
    for (let number = 1; number <= periods; number++) {
      const startsAt = new Date(seasonStart.getTime() + (number - 1) * 7 * 86_400_000);
      const period = await tx.scoringPeriod.create({ data: { leagueId, leagueSportId: leagueSport.id, sport: leagueSport.sport, number, startsAt, endsAt: new Date(startsAt.getTime() + 7 * 86_400_000 - 1) } });
      for (const pairing of pairings.filter(({ round }) => round === number)) await tx.matchup.create({ data: { leagueId, sport: leagueSport.sport, periodId: period.id, homeTeamId: pairing.homeTeamId, awayTeamId: pairing.awayTeamId } });
    }
  });
}

type AuthoritativeMatchup = Matchup & { period: { competitionId: string | null } };
const correctionWindow = 24 * 60 * 60 * 1000;

async function refreshAuthoritativeMatchups(tx: Prisma.TransactionClient, matchups: readonly AuthoritativeMatchup[], now: Date, finalize = false) {
  const byPeriod = new Map<string, AuthoritativeMatchup[]>();
  for (const matchup of matchups) {
    if (!matchup.finalizedAt && matchup.period.competitionId) {
      const periodMatchups = byPeriod.get(matchup.periodId) ?? [];
      periodMatchups.push(matchup);
      byPeriod.set(matchup.periodId, periodMatchups);
    }
  }
  let finalized = 0;
  for (const [periodId, games] of byPeriod) {
    const publishedAt = await periodPublicationTime(tx, periodId, now);
    const deadline = publishedAt ? new Date(publishedAt.getTime() + correctionWindow) : null;
    const due = deadline != null && deadline <= now;
    const scores = await scoreCapturedStarters(tx, [games[0].period.competitionId!], now, {
      periodId, publicationThrough: deadline ? new Date(Math.min(Number(deadline), Number(now))) : undefined,
    });
    const byTeam = new Map(scores.map((row) => [row.teamId, row.pointsFor]));
    if (!scores.some(({ scoredStarters }) => scoredStarters > 0) && !deadline) continue;
    for (const matchup of games) {
      const homeTenths = byTeam.get(matchup.homeTeamId) ?? 0n;
      const awayTenths = byTeam.get(matchup.awayTeamId) ?? 0n;
      if (deadline) {
        const last = await tx.matchupResultRevision.findFirst({
          where: { matchupId: matchup.id }, orderBy: { revision: "desc" },
        });
        if (!last || last.homeTenths !== homeTenths || last.awayTenths !== awayTenths || Number(last.finalizesAt) !== Number(deadline)) {
          await tx.matchupResultRevision.create({ data: {
            matchupId: matchup.id, revision: (last?.revision ?? 0) + 1,
            homeTenths, awayTenths, calculatedAt: now, finalizesAt: deadline,
            correctionReason: last ? "Official starter scores changed within the competitive correction window." : null,
          } });
        }
      }
      const isFinal = finalize && due;
      await tx.matchup.update({ where: { id: matchup.id }, data: {
        homeTenths, awayTenths, calculatedAt: now, resultFinalizesAt: deadline,
        status: isFinal ? "FINAL" : "SCHEDULED", finalizedAt: isFinal ? now : null,
      } });
      if (isFinal) finalized++;
    }
  }
  return finalized;
}

export async function recalculateMatchups(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { select: { isHistorical: true } } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can recalculate matchups.");
  const calculatedAt = new Date();
  await captureDueGameLineups(calculatedAt);
  if (!member.league.isHistorical) {
    return database.$transaction(async (tx) => {
      const games = await tx.matchup.findMany({
        where: {
          leagueId, sport: leagueSport.sport, finalizedAt: null, period: {
            startsAt: { lte: calculatedAt },
            competition: { leagueSportSeason: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId } },
          },
        },
        include: { period: true },
      });
      await refreshAuthoritativeMatchups(tx, games, calculatedAt);
      return games.length;
    }, { isolationLevel: "Serializable" });
  }
  const matchups = await database.matchup.findMany({ where: { leagueId, sport: leagueSport.sport }, include: { period: true } });
  if (!matchups.length) return 0;
  const periods = [...new Map(matchups.map(({ period }) => [period.id, period])).values()];
  const league = await database.league.findUniqueOrThrow({ where: { id: leagueId }, select: { presetId: true } });
  const snapshots = await database.gameLineupSnapshot.findMany({
    where: { leagueId, isStarter: true, sportCompetition: { sport: leagueSport.sport }, scoringPeriodId: { in: periods.map(({ id }) => id) } },
    select: { teamId: true, scoringPeriodId: true, gameId: true, playerId: true },
  });
  const ledgers = snapshots.length ? await database.scoreLedger.findMany({
    where: { presetId: league.presetId, gameId: { in: [...new Set(snapshots.map(({ gameId }) => gameId))] }, playerId: { in: [...new Set(snapshots.map(({ playerId }) => playerId))] } },
    include: { entries: { orderBy: { sequence: "desc" }, take: 1 } },
  }) : [];
  const score = new Map(ledgers.map((ledger) => [`${ledger.gameId}:${ledger.playerId}`, ledger.entries[0]?.totalTenths ?? 0n]));
  const totals = new Map<string, bigint>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.teamId}:${snapshot.scoringPeriodId}`;
    totals.set(key, (totals.get(key) ?? 0n) + (score.get(`${snapshot.gameId}:${snapshot.playerId}`) ?? 0n));
  }
  await database.$transaction(async (tx) => {
    for (const matchup of matchups) {
      const homeTenths = totals.get(`${matchup.homeTeamId}:${matchup.periodId}`) ?? 0n;
      const awayTenths = totals.get(`${matchup.awayTeamId}:${matchup.periodId}`) ?? 0n;
      if (matchup.finalizedAt) continue;
      const latest = await tx.matchupResultRevision.findFirst({ where: { matchupId: matchup.id }, orderBy: { revision: "desc" } });
      if (latest?.homeTenths === homeTenths && latest.awayTenths === awayTenths) continue;
      await tx.matchupResultRevision.create({ data: {
        matchupId: matchup.id, revision: (latest?.revision ?? 0) + 1, homeTenths, awayTenths, calculatedAt,
        finalizesAt: new Date(calculatedAt.getTime() + 24 * 60 * 60 * 1000), correctionReason: latest ? "Authoritative score ledger changed before competitive finalization." : null,
      } });
      await tx.matchup.update({ where: { id: matchup.id }, data: { homeTenths, awayTenths, calculatedAt,
        resultFinalizesAt: new Date(calculatedAt.getTime() + 24 * 60 * 60 * 1000), status: "SCHEDULED" } });
    }
  }, { isolationLevel: "Serializable" });
  return matchups.length;
}

export async function finalizeDueMatchups(now = new Date(), leagueId?: string) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const due = await tx.matchup.findMany({ where: { leagueId, finalizedAt: null, resultFinalizesAt: { lte: now }, resultRevisions: { some: {} } },
      include: { period: true, resultRevisions: { orderBy: { revision: "desc" }, take: 1 } } });
    const finalized = await refreshAuthoritativeMatchups(tx, due, now, true);
    const historical = due.filter((matchup) => matchup.period.competitionId == null);
    for (const matchup of historical) {
      const revision = matchup.resultRevisions[0];
      await tx.matchup.update({ where: { id: matchup.id }, data: { status: "FINAL", finalizedAt: now } });
      // Revisions are append-only; finalization is recorded on the competitive result, not by rewriting its statistical source.
      if (revision && revision.finalizesAt > now) throw new Error("A matchup revision is not yet eligible for finalization.");
    }
    return finalized + historical.length;
  }, { isolationLevel: "Serializable" });
}

export async function standings(leagueId: string, requestedSport?: Sport | string) {
  const leagueSport = await resolveLeagueSport(leagueId, requestedSport); const database = getDatabase();
  const teams = await database.fantasyTeam.findMany({ where: { leagueId }, orderBy: { name: "asc" } });
  const league = await database.league.findUniqueOrThrow({ where: { id: leagueId }, select: { isHistorical: true } });
  const competition = league.isHistorical ? null : await database.sportCompetition.findFirst({
    where: { leagueId, leagueSportSeason: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId } },
    select: { id: true },
  });
  const matchups = await database.matchup.findMany({ where: {
    leagueId, sport: leagueSport.sport, status: "FINAL", period: { competitionId: competition?.id ?? null },
    isPlayoff: competition ? false : undefined,
  } });
  if (competition) {
    const draw = await database.competitiveTiebreakerEvent.findMany({
      where: { leagueId, scopeType: "STANDINGS", scopeId: competition.id },
    });
    const byTeam = new Map(teams.map((team) => [team.id, team]));
    const rows = summarizeH2H(teams.map(({ id }) => id), matchups);
    return rankH2HStandings(rows, matchups, new Map(draw.map(({ teamId, drawRank }) => [teamId, drawRank])), true)
      .map(({ teamId, ...result }) => ({ ...byTeam.get(teamId)!, ...result }));
  }
  return teams.map((team) => {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0n, pointsAgainst = 0n;
    for (const matchup of matchups) {
      const home = matchup.homeTeamId === team.id; const away = matchup.awayTeamId === team.id; if (!home && !away) continue;
      const own = home ? matchup.homeTenths : matchup.awayTenths; const opponent = home ? matchup.awayTenths : matchup.homeTenths;
      pointsFor += own; pointsAgainst += opponent; if (own > opponent) wins++; else if (own < opponent) losses++; else ties++;
    }
    return { ...team, wins, losses, ties, pointsFor, pointsAgainst };
  }).sort((a, b) => b.wins - a.wins || b.ties - a.ties || (a.pointsFor === b.pointsFor ? 0 : a.pointsFor > b.pointsFor ? -1 : 1) ||
    (a.pointsAgainst === b.pointsAgainst ? a.name.localeCompare(b.name) : a.pointsAgainst < b.pointsAgainst ? -1 : 1))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function generateNextPlayoffRound(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can generate playoffs.");
  if (member.league.competitionType === "CUMULATIVE") throw new Error("Cumulative leagues have no fantasy playoffs.");
  if (!member.league.isHistorical) throw new Error("Advance the source-backed competition bracket to schedule playoffs.");
  const prior = await database.matchup.findMany({ where: { leagueId, sport: leagueSport.sport, isPlayoff: true } });
  const seedOrder = (await standings(leagueId, leagueSport.sport)).map(({ id }) => id); let teams: string[]; let round: number;
  if (!prior.length) {
    const count = Math.min(member.league.playoffTeams, seedOrder.length); if (count < 2 || count % 2) throw new Error("Configure an even playoff field that fits this league.");
    teams = seedOrder.slice(0, count); round = 1;
  } else {
    round = Math.max(...prior.map(({ playoffRound }) => playoffRound ?? 0)) + 1;
    if (round > member.league.playoffPeriods) throw new Error("Every configured playoff round already exists.");
    const lastRound = prior.filter(({ playoffRound }) => playoffRound === round - 1); if (lastRound.some(({ status }) => status !== "FINAL")) throw new Error("Finalize the prior playoff round first.");
    teams = lastRound.map((matchup) => matchup.homeTenths >= matchup.awayTenths ? matchup.homeTeamId : matchup.awayTeamId).sort((a, b) => seedOrder.indexOf(a) - seedOrder.indexOf(b));
  }
  if (teams.length < 2 || teams.length % 2) throw new Error("The playoff bracket cannot form complete matchups.");
  const latest = await database.scoringPeriod.findFirst({ where: { leagueId, sport: leagueSport.sport }, orderBy: { number: "desc" } });
  const number = (latest?.number ?? 0) + 1; const startsAt = latest ? new Date(latest.endsAt.getTime() + 1) : new Date();
  return database.$transaction(async (tx) => {
    const period = await tx.scoringPeriod.create({ data: { leagueId, leagueSportId: leagueSport.id, sport: leagueSport.sport, number, startsAt, endsAt: new Date(startsAt.getTime() + 7 * 86_400_000 - 1) } });
    for (let index = 0; index < teams.length / 2; index++) await tx.matchup.create({ data: { leagueId, sport: leagueSport.sport, periodId: period.id, homeTeamId: teams[index], awayTeamId: teams[teams.length - 1 - index], isPlayoff: true, playoffRound: round } });
    return period;
  }, { isolationLevel: "Serializable" });
}

export async function advanceHistoricalPeriod(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
  if (member?.role !== "COMMISSIONER" || !member.league.isHistorical) throw new Error("Only a historical league commissioner can advance replay time.");
  const next = await database.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId, sport: leagueSport.sport, number: member.league.currentPeriod + 1 } } });
  if (!next) throw new Error("There is no later historical scoring period.");
  await recalculateMatchups(userId, leagueId, leagueSport.sport); await database.league.update({ where: { id: leagueId }, data: { currentPeriod: next.number } }); return next.number;
}
