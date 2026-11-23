import { getDatabase } from "@/lib/db";

export async function generateSchedule(userId: string, leagueId: string, periods = 14) {
  const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { teams: { orderBy: { draftSlot: "asc" } } } } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can generate the schedule.");
  const teams = member.league.teams.map(({ id }) => id);
  if (teams.length < 2 || teams.length % 2) throw new Error("Head-to-head schedules require an even number of teams.");
  return database.$transaction(async (tx) => {
    if (await tx.scoringPeriod.count({ where: { leagueId } })) throw new Error("A schedule already exists.");
    const rotation = [...teams];
    const seasonStart = new Date(Date.UTC(member.league.seasonYear, member.league.primarySport === "NFL" ? 8 : 0, 1));
    for (let number = 1; number <= periods; number++) {
      const startsAt = new Date(seasonStart.getTime() + (number - 1) * 7 * 86_400_000);
      const period = await tx.scoringPeriod.create({ data: { leagueId, number, startsAt, endsAt: new Date(startsAt.getTime() + 7 * 86_400_000 - 1) } });
      for (let index = 0; index < rotation.length / 2; index++) {
        const homeTeamId = rotation[index];
        const awayTeamId = rotation[rotation.length - 1 - index];
        await tx.matchup.create({ data: { leagueId, periodId: period.id, homeTeamId, awayTeamId } });
      }
      rotation.splice(1, 0, rotation.pop()!);
    }
  });
}

async function teamPoints(teamId: string, startsAt: Date, endsAt: Date) {
  const roster = await getDatabase().rosterEntry.findMany({
    where: { teamId },
    include: { player: { include: { scoreLedgers: {
      where: { game: { OR: [{ startsAt: { gte: startsAt, lte: endsAt } }, { gameDate: { gte: startsAt, lte: endsAt } }] } },
      include: { entries: { orderBy: { sequence: "desc" }, take: 1 } },
    } } } },
  });
  return roster.reduce((total, entry) => total + entry.player.scoreLedgers.reduce((sum, ledger) => sum + (ledger.entries[0]?.totalTenths ?? 0n), 0n), 0n);
}

export async function recalculateMatchups(userId: string, leagueId: string) {
  const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can recalculate matchups.");
  const matchups = await database.matchup.findMany({ where: { leagueId }, include: { period: true } });
  for (const matchup of matchups) {
    const [homeTenths, awayTenths] = await Promise.all([
      teamPoints(matchup.homeTeamId, matchup.period.startsAt, matchup.period.endsAt),
      teamPoints(matchup.awayTeamId, matchup.period.startsAt, matchup.period.endsAt),
    ]);
    await database.matchup.update({ where: { id: matchup.id }, data: {
      homeTenths, awayTenths, calculatedAt: new Date(), status: matchup.period.endsAt <= new Date() ? "FINAL" : "SCHEDULED",
    } });
  }
  return matchups.length;
}

export async function standings(leagueId: string) {
  const teams = await getDatabase().fantasyTeam.findMany({ where: { leagueId }, orderBy: { name: "asc" } });
  const matchups = await getDatabase().matchup.findMany({ where: { leagueId, status: "FINAL" } });
  return teams.map((team) => {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0n, pointsAgainst = 0n;
    for (const matchup of matchups) {
      const home = matchup.homeTeamId === team.id;
      const away = matchup.awayTeamId === team.id;
      if (!home && !away) continue;
      const own = home ? matchup.homeTenths : matchup.awayTenths;
      const opponent = home ? matchup.awayTenths : matchup.homeTenths;
      pointsFor += own; pointsAgainst += opponent;
      if (own > opponent) wins++; else if (own < opponent) losses++; else ties++;
    }
    return { ...team, wins, losses, ties, pointsFor, pointsAgainst };
  }).sort((a, b) => b.wins - a.wins || b.ties - a.ties || (a.pointsFor > b.pointsFor ? -1 : 1));
}

export async function advanceHistoricalPeriod(userId: string, leagueId: string) {
  const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
  if (member?.role !== "COMMISSIONER" || !member.league.isHistorical) throw new Error("Only a historical league commissioner can advance replay time.");
  const next = await database.scoringPeriod.findUnique({ where: { leagueId_number: { leagueId, number: member.league.currentPeriod + 1 } } });
  if (!next) throw new Error("There is no later historical scoring period.");
  await recalculateMatchups(userId, leagueId);
  await database.league.update({ where: { id: leagueId }, data: { currentPeriod: next.number } });
  return next.number;
}
