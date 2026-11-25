import { createHash, randomBytes } from "node:crypto";
import type { Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { roundRobinPairings } from "@/server/matchups";

export type StandingInput = { teamId: string; wins: number; losses: number; ties: number; pointsFor: bigint; pointsAgainst: bigint };
export type MatchupInput = { homeTeamId: string; awayTeamId: string; homeTenths: bigint; awayTenths: bigint };
export type Rational = { numerator: number; denominator: number };

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
export function rational(numerator: number, denominator = 1): Rational {
  if (denominator <= 0) throw new Error("A championship-point denominator must be positive.");
  const divisor = gcd(numerator, denominator) || 1; return { numerator: numerator / divisor, denominator: denominator / divisor };
}
export function addRational(a: Rational, b: Rational) { return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator); }

function recordCompare(a: StandingInput, b: StandingInput) {
  const aGames = a.wins + a.losses + a.ties; const bGames = b.wins + b.losses + b.ties;
  return (b.wins * 2 + b.ties) * Math.max(1, aGames) - (a.wins * 2 + a.ties) * Math.max(1, bGames);
}

export function rankH2HStandings(rows: readonly StandingInput[], games: readonly MatchupInput[], drawRanks: ReadonlyMap<string, number>) {
  const headToHead = (teamId: string, group: ReadonlySet<string>) => {
    let earned = 0, possible = 0;
    for (const game of games) {
      if (!group.has(game.homeTeamId) || !group.has(game.awayTeamId) || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) continue;
      possible += 2; const own = game.homeTeamId === teamId ? game.homeTenths : game.awayTenths; const other = game.homeTeamId === teamId ? game.awayTenths : game.homeTenths;
      earned += own > other ? 2 : own === other ? 1 : 0;
    }
    return { earned, possible };
  };
  return [...rows].sort((a, b) => {
    let compared = recordCompare(a, b); if (compared) return compared;
    if (a.pointsFor !== b.pointsFor) return a.pointsFor > b.pointsFor ? -1 : 1;
    const tied = new Set(rows.filter((row) => !recordCompare(a, row) && row.pointsFor === a.pointsFor).map(({ teamId }) => teamId));
    const ah = headToHead(a.teamId, tied); const bh = headToHead(b.teamId, tied);
    compared = bh.earned * Math.max(1, ah.possible) - ah.earned * Math.max(1, bh.possible); if (compared) return compared;
    if (a.pointsAgainst !== b.pointsAgainst) return a.pointsAgainst < b.pointsAgainst ? -1 : 1;
    const ad = drawRanks.get(a.teamId); const bd = drawRanks.get(b.teamId);
    if (ad == null || bd == null) throw new Error("A recorded random draw is required to resolve the standings tie.");
    return ad - bd;
  }).map((row, index) => ({ ...row, rank: index + 1 }));
}

export type PlacementInput = { teamId: string; placement: number; qualified: boolean; regularPfTenths: bigint };
export type AwardConfig = { qualification: number; champion: number; runnerUp: number; third: number; highestPf: number; lowestPf: number };
export type PointAward = { teamId: string; type: "BASE_PLACEMENT" | "PLAYOFF_QUALIFICATION" | "SPORT_CHAMPION" | "SPORT_RUNNER_UP" | "SPORT_THIRD_PLACE" | "HIGHEST_REGULAR_PF" | "LOWEST_REGULAR_PF"; points: Rational };

export function championshipPointAwards(placements: readonly PlacementInput[], config: AwardConfig): PointAward[] {
  if (!placements.length) return [];
  const count = placements.length; const awards: PointAward[] = [];
  for (const row of placements) {
    if (row.placement < 1 || row.placement > count) throw new Error("Every team requires one valid final placement.");
    awards.push({ teamId: row.teamId, type: "BASE_PLACEMENT", points: rational(count - row.placement + 1) });
    if (row.qualified) awards.push({ teamId: row.teamId, type: "PLAYOFF_QUALIFICATION", points: rational(config.qualification) });
    if (row.placement === 1) awards.push({ teamId: row.teamId, type: "SPORT_CHAMPION", points: rational(config.champion) });
    else if (row.placement === 2) awards.push({ teamId: row.teamId, type: "SPORT_RUNNER_UP", points: rational(config.runnerUp) });
    else if (row.placement === 3) awards.push({ teamId: row.teamId, type: "SPORT_THIRD_PLACE", points: rational(config.third) });
  }
  const highest = placements.reduce((value, row) => row.regularPfTenths > value ? row.regularPfTenths : value, placements[0].regularPfTenths);
  const lowest = placements.reduce((value, row) => row.regularPfTenths < value ? row.regularPfTenths : value, placements[0].regularPfTenths);
  const highTeams = placements.filter((row) => row.regularPfTenths === highest); const lowTeams = placements.filter((row) => row.regularPfTenths === lowest);
  for (const row of highTeams) awards.push({ teamId: row.teamId, type: "HIGHEST_REGULAR_PF", points: rational(config.highestPf, highTeams.length) });
  for (const row of lowTeams) awards.push({ teamId: row.teamId, type: "LOWEST_REGULAR_PF", points: rational(config.lowestPf, lowTeams.length) });
  return awards;
}

export function championshipPointTotals(awards: readonly PointAward[]) {
  const result = new Map<string, Rational>();
  for (const award of awards) result.set(award.teamId, addRational(result.get(award.teamId) ?? rational(0), award.points));
  return result;
}

export type BracketNode = { key: string; placementRange: [number, number]; home: string; away: string };
export function defaultFixedBracket(teamCount: number, playoffTeams = Math.min(6, teamCount)): BracketNode[] {
  if (teamCount < 2 || ![2, 4, 6].includes(playoffTeams) || playoffTeams > teamCount) throw new Error("Configure a supported two-, four-, or six-team playoff field that fits the league.");
  const nodes: BracketNode[] = [];
  const six = (prefix: string, offset: number) => {
    nodes.push({ key: `${prefix}-QF-A`, placementRange: [offset + 1, offset + 6], home: `SEED_${offset + 3}`, away: `SEED_${offset + 6}` });
    nodes.push({ key: `${prefix}-QF-B`, placementRange: [offset + 1, offset + 6], home: `SEED_${offset + 4}`, away: `SEED_${offset + 5}` });
    nodes.push({ key: `${prefix}-SF-A`, placementRange: [offset + 1, offset + 4], home: `SEED_${offset + 1}`, away: `WINNER_${prefix}-QF-B` });
    nodes.push({ key: `${prefix}-SF-B`, placementRange: [offset + 1, offset + 4], home: `SEED_${offset + 2}`, away: `WINNER_${prefix}-QF-A` });
    nodes.push({ key: `${prefix}-FINAL`, placementRange: [offset + 1, offset + 2], home: `WINNER_${prefix}-SF-A`, away: `WINNER_${prefix}-SF-B` });
    nodes.push({ key: `${prefix}-THIRD`, placementRange: [offset + 3, offset + 4], home: `LOSER_${prefix}-SF-A`, away: `LOSER_${prefix}-SF-B` });
    nodes.push({ key: `${prefix}-FIFTH`, placementRange: [offset + 5, offset + 6], home: `LOSER_${prefix}-QF-A`, away: `LOSER_${prefix}-QF-B` });
  };
  if (playoffTeams === 6) six("CHAMP", 0);
  else if (playoffTeams === 4) {
    nodes.push({ key: "CHAMP-SF-A", placementRange: [1, 4], home: "SEED_1", away: "SEED_4" }, { key: "CHAMP-SF-B", placementRange: [1, 4], home: "SEED_2", away: "SEED_3" },
      { key: "CHAMP-FINAL", placementRange: [1, 2], home: "WINNER_CHAMP-SF-A", away: "WINNER_CHAMP-SF-B" }, { key: "CHAMP-THIRD", placementRange: [3, 4], home: "LOSER_CHAMP-SF-A", away: "LOSER_CHAMP-SF-B" });
  } else nodes.push({ key: "CHAMP-FINAL", placementRange: [1, 2], home: "SEED_1", away: "SEED_2" });
  const remaining = teamCount - playoffTeams;
  if (remaining === 6) six("CONSOLATION", playoffTeams);
  else if (remaining === 4) nodes.push({ key: "CONSOLATION-SF-A", placementRange: [playoffTeams + 1, teamCount], home: `SEED_${playoffTeams + 1}`, away: `SEED_${teamCount}` },
    { key: "CONSOLATION-SF-B", placementRange: [playoffTeams + 1, teamCount], home: `SEED_${playoffTeams + 2}`, away: `SEED_${teamCount - 1}` },
    { key: "CONSOLATION-HIGH", placementRange: [playoffTeams + 1, playoffTeams + 2], home: "WINNER_CONSOLATION-SF-A", away: "WINNER_CONSOLATION-SF-B" },
    { key: "CONSOLATION-LOW", placementRange: [teamCount - 1, teamCount], home: "LOSER_CONSOLATION-SF-A", away: "LOSER_CONSOLATION-SF-B" });
  else if (remaining === 2) nodes.push({ key: "CONSOLATION", placementRange: [teamCount - 1, teamCount], home: `SEED_${teamCount - 1}`, away: `SEED_${teamCount}` });
  return nodes;
}

function weekKey(sport: Sport, game: { startsAt: Date; week: number | null }) {
  if (sport === "NFL" && game.week != null) return `NFL-${String(game.week).padStart(2, "0")}`;
  const date = new Date(game.startsAt); const day = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - day); date.setUTCHours(0, 0, 0, 0); return date.toISOString();
}

export async function ensureRecordedDraw(leagueId: string, scopeType: string, scopeId: string, teamIds: readonly string[]) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const existing = await tx.competitiveTiebreakerEvent.findMany({ where: { scopeType, scopeId }, orderBy: { drawRank: "asc" } });
    if (existing.length) {
      if (existing.length !== teamIds.length || teamIds.some((id) => !existing.some((row) => row.teamId === id))) throw new Error("The recorded draw scope cannot be changed after execution.");
      return existing;
    }
    const shuffled = teamIds.map((teamId) => ({ teamId, token: randomBytes(32).toString("hex") })).sort((a, b) => a.token.localeCompare(b.token));
    await tx.competitiveTiebreakerEvent.createMany({ data: shuffled.map((row, index) => ({ leagueId, scopeType, scopeId, teamId: row.teamId, drawRank: index + 1, randomToken: row.token })) });
    return tx.competitiveTiebreakerEvent.findMany({ where: { scopeType, scopeId }, orderBy: { drawRank: "asc" } });
  }, { isolationLevel: "Serializable" });
}

export async function provisionCompetitionSchedule(userId: string, sportCompetitionId: string) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const competition = await tx.sportCompetition.findUniqueOrThrow({ where: { id: sportCompetitionId }, include: {
      league: { include: { teams: { orderBy: { draftSlot: "asc" } }, members: { where: { userId } } } }, configSnapshot: true,
      leagueSportSeason: { include: { season: true, leagueSport: true } }, periods: true,
    } });
    if (competition.league.members[0]?.role !== "COMMISSIONER") throw new Error("Only the commissioner can provision competition periods.");
    if (competition.periods.length) return competition;
    const games = await tx.game.findMany({ where: { seasonId: competition.leagueSportSeason.seasonId, phase: "REGULAR", startsAt: { not: null } }, orderBy: { startsAt: "asc" } });
    const eligible = games.filter((game): game is typeof game & { startsAt: Date } => Boolean(game.startsAt) && !(competition.sport === "NFL" && competition.configSnapshot.competitionType === "HEAD_TO_HEAD" && (game.week ?? 99) > 17));
    if (!eligible.length) return tx.sportCompetition.update({ where: { id: competition.id }, data: { status: "PENDING_DATA", statusReason: "No authoritative UTC regular-season games are available for this professional season." } });
    const groups = new Map<string, typeof eligible>();
    for (const game of eligible) groups.set(weekKey(competition.sport, game), [...(groups.get(weekKey(competition.sport, game)) ?? []), game]);
    const weeks = [...groups.entries()].sort((a, b) => a[1][0].startsAt.getTime() - b[1][0].startsAt.getTime());
    const playoffWeeks = competition.configSnapshot.competitionType === "HEAD_TO_HEAD" ? competition.configSnapshot.playoffWeeks : 0;
    if (playoffWeeks >= weeks.length) throw new Error("The authoritative schedule does not contain enough weeks for the configured regular season and playoffs.");
    const regularCount = weeks.length - playoffWeeks;
    const pairings = competition.configSnapshot.competitionType === "HEAD_TO_HEAD"
      ? roundRobinPairings(competition.league.teams.map(({ id }) => id), regularCount) : [];
    for (let index = 0; index < weeks.length; index++) {
      const weekGames = weeks[index][1]; const periodType = index < regularCount ? "REGULAR" : "PLAYOFF";
      const period = await tx.scoringPeriod.create({ data: { leagueId: competition.leagueId, leagueSportId: competition.leagueSportSeason.leagueSportId,
        sport: competition.sport, number: index + 1, competitionId: competition.id, periodType,
        startsAt: weekGames[0].startsAt, endsAt: weekGames[weekGames.length - 1].startsAt } });
      await tx.competitionPeriodGame.createMany({ data: weekGames.map((game) => ({ sportCompetitionId: competition.id, scoringPeriodId: period.id, gameId: game.id })) });
      if (periodType === "REGULAR") for (const pairing of pairings.filter(({ round }) => round === index + 1)) await tx.matchup.create({ data: {
        leagueId: competition.leagueId, sport: competition.sport, periodId: period.id, homeTeamId: pairing.homeTeamId, awayTeamId: pairing.awayTeamId,
      } });
    }
    const fingerprint = createHash("sha256").update(eligible.map((game) => `${game.id}:${game.startsAt.toISOString()}`).join("|")).digest("hex");
    return tx.sportCompetition.update({ where: { id: competition.id }, data: { status: "UPCOMING", statusReason: `Source-backed periods provisioned from schedule ${fingerprint}.`,
      fantasyPlayoffStartsAt: playoffWeeks ? weeks[regularCount][1][0].startsAt : null,
      fantasyPlayoffEndsAt: playoffWeeks ? weeks.at(-1)![1].at(-1)!.startsAt : null } });
  }, { isolationLevel: "Serializable" });
}
