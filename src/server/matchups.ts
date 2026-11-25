import type { Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { resolveLeagueSport } from "./league";
import { captureDueGameLineups } from "./lineup-snapshots";

export function roundRobinPairings(teamIds: readonly string[], rounds: number) {
  if (teamIds.length < 2) throw new Error("A schedule requires at least two franchises.");
  const rotation: (string | null)[] = [...teamIds]; if (rotation.length % 2) rotation.push(null);
  const result: { round: number; homeTeamId: string; awayTeamId: string }[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (let index = 0; index < rotation.length / 2; index++) {
      const homeTeamId = rotation[index]; const awayTeamId = rotation[rotation.length - 1 - index];
      if (homeTeamId && awayTeamId) result.push({ round, homeTeamId, awayTeamId });
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return result;
}

export async function generateSchedule(userId: string, leagueId: string, periods = 14, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { teams: { orderBy: { draftSlot: "asc" } } } } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can generate the schedule.");
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

export async function recalculateMatchups(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can recalculate matchups.");
  const matchups = await database.matchup.findMany({ where: { leagueId, sport: leagueSport.sport }, include: { period: true } });
  if (!matchups.length) return 0;
  const calculatedAt = new Date();
  await captureDueGameLineups(calculatedAt);
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
      if (!latest || latest.homeTenths !== homeTenths || latest.awayTenths !== awayTenths) await tx.matchupResultRevision.create({ data: {
        matchupId: matchup.id, revision: (latest?.revision ?? 0) + 1, homeTenths, awayTenths, calculatedAt,
        finalizesAt: new Date(calculatedAt.getTime() + 24 * 60 * 60 * 1000), correctionReason: latest ? "Authoritative score ledger changed before competitive finalization." : null,
      } });
      await tx.matchup.update({ where: { id: matchup.id }, data: { homeTenths, awayTenths, calculatedAt,
        resultFinalizesAt: new Date(calculatedAt.getTime() + 24 * 60 * 60 * 1000), status: "SCHEDULED" } });
    }
  }, { isolationLevel: "Serializable" });
  return matchups.length;
}

export async function finalizeDueMatchups(now = new Date()) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const due = await tx.matchup.findMany({ where: { finalizedAt: null, resultFinalizesAt: { lte: now }, resultRevisions: { some: {} } },
      include: { resultRevisions: { orderBy: { revision: "desc" }, take: 1 } } });
    for (const matchup of due) {
      const revision = matchup.resultRevisions[0];
      await tx.matchup.update({ where: { id: matchup.id }, data: { status: "FINAL", finalizedAt: now } });
      // Revisions are append-only; finalization is recorded on the competitive result, not by rewriting its statistical source.
      if (revision && revision.finalizesAt > now) throw new Error("A matchup revision is not yet eligible for finalization.");
    }
    return due.length;
  }, { isolationLevel: "Serializable" });
}

export async function standings(leagueId: string, requestedSport?: Sport | string) {
  const leagueSport = await resolveLeagueSport(leagueId, requestedSport); const database = getDatabase();
  const teams = await database.fantasyTeam.findMany({ where: { leagueId }, orderBy: { name: "asc" } });
  const matchups = await database.matchup.findMany({ where: { leagueId, sport: leagueSport.sport, status: "FINAL" } });
  return teams.map((team) => {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0n, pointsAgainst = 0n;
    for (const matchup of matchups) {
      const home = matchup.homeTeamId === team.id; const away = matchup.awayTeamId === team.id; if (!home && !away) continue;
      const own = home ? matchup.homeTenths : matchup.awayTenths; const opponent = home ? matchup.awayTenths : matchup.homeTenths;
      pointsFor += own; pointsAgainst += opponent; if (own > opponent) wins++; else if (own < opponent) losses++; else ties++;
    }
    return { ...team, wins, losses, ties, pointsFor, pointsAgainst };
  }).sort((a, b) => b.wins - a.wins || b.ties - a.ties || (a.pointsFor === b.pointsFor ? 0 : a.pointsFor > b.pointsFor ? -1 : 1) ||
    (a.pointsAgainst === b.pointsAgainst ? a.name.localeCompare(b.name) : a.pointsAgainst < b.pointsAgainst ? -1 : 1));
}

export async function generateNextPlayoffRound(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can generate playoffs.");
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
