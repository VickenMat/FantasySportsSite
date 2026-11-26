import { activeFranchises } from "./franchise-participation";
import type { Matchup } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { refreshH2HChampionship } from "./championships";
import {
  championshipPointAwards, defaultFixedBracket, rankH2HStandings, recordCompetitionDraw, summarizeH2H,
  type MatchupInput, type StandingInput,
} from "./competition";

function playoffWinner(game: Matchup, regular: readonly MatchupInput[], seeds: ReadonlyMap<string, StandingInput & { rank: number }>, order: readonly string[]) {
  const home = seeds.get(game.homeTeamId);
  const away = seeds.get(game.awayTeamId);
  if (!home || !away) throw new Error("A playoff matchup references a team outside the seeded bracket.");
  for (const rule of order) {
    let comparison: bigint | number;
    switch (rule) {
      case "MATCHUP_UBP":
        comparison = game.homeTenths - game.awayTenths;
        break;
      case "HEAD_TO_HEAD":
        comparison = regular.reduce((record, result) => {
          const outcome = result.homeTenths > result.awayTenths ? 1 : result.homeTenths < result.awayTenths ? -1 : 0;
          if (result.homeTeamId === home.teamId && result.awayTeamId === away.teamId) return record + outcome;
          if (result.homeTeamId === away.teamId && result.awayTeamId === home.teamId) return record - outcome;
          return record;
        }, 0);
        break;
      case "REGULAR_PF":
        comparison = home.pointsFor - away.pointsFor;
        break;
      case "ORIGINAL_SEED":
        comparison = away.rank - home.rank;
        break;
      default:
        throw new Error(`Unsupported playoff tiebreaker ${rule}.`);
    }
    if (comparison > 0) return home.teamId;
    if (comparison < 0) return away.teamId;
  }
  throw new Error("The configured playoff tiebreakers did not determine a winner.");
}

export function advanceSportPlayoffs(userId: string, competitionId: string, now = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const competition = await tx.sportCompetition.findUniqueOrThrow({
      where: { id: competitionId },
      include: {
        configSnapshot: true,
        league: { include: { members: { where: { userId } }, teams: { select: { id: true } } } },
        periods: { include: { matchups: true }, orderBy: { number: "asc" } },
      },
    });
    if (competition.league.members[0]?.role !== "COMMISSIONER") throw new Error("Only the commissioner can advance playoffs.");
    const config = competition.configSnapshot;
    if (config.competitionType !== "HEAD_TO_HEAD") throw new Error("Cumulative leagues have no fantasy playoffs.");
    if (!config.fixedBracket) throw new Error("This competition does not use a fixed playoff bracket.");
    if (competition.finalizedAt) {
      await refreshH2HChampionship(tx, config.championshipCycleId, now);
      return { status: "FINALIZED" as const, created: 0 };
    }
    const regular = competition.periods.filter(({ periodType }) => periodType === "REGULAR");
    const playoffs = competition.periods.filter(({ periodType }) => periodType === "PLAYOFF");
    if (!regular.length || !playoffs.length) throw new Error("Provision the authoritative playoff schedule first.");

    competition.league.teams = await activeFranchises(tx, competition.leagueId, competition.league.teams);
    const teamIds = competition.league.teams.map(({ id }) => id);
    const finalized = (game: Matchup) => (game.status === "FINAL" || (!game.isPlayoff && game.status === "SKIPPED")) && game.finalizedAt != null && game.finalizedAt <= now;
    const gamesPerPeriod = Math.floor(teamIds.length / 2);
    if (regular.some(({ matchups }) => matchups.length !== gamesPerPeriod || matchups.some((game) => !finalized(game)))) {
      return { status: "PENDING_REGULAR_RESULTS" as const, created: 0 };
    }
    const games = regular.flatMap(({ matchups }) => matchups);
    const draw = await recordCompetitionDraw(tx, competition.leagueId, "STANDINGS", competition.id, teamIds);
    const ranked = rankH2HStandings(summarizeH2H(teamIds, games), games, new Map(draw.map((row) => [row.teamId, row.drawRank])));
    const seeds = new Map(ranked.map((row) => [row.teamId, row]));
    const bracket = defaultFixedBracket(ranked.length, config.playoffTeams)
      .filter(({ key }) => (config.thirdPlaceEnabled || key !== "CHAMP-THIRD") && (config.consolationEnabled || (!key.startsWith("CONSOLATION") && key !== "CHAMP-FIFTH")))
      .map((node) => {
        // Placement games occupy the last published playoff period.
        const weeksBeforeFinal = node.key.includes("-QF-") ? 2 : node.key.includes("-SF-") ? 1 : 0;
        const period = playoffs.at(-1 - weeksBeforeFinal);
        if (!period) throw new Error("The authoritative playoff schedule cannot fit the configured bracket.");
        return { ...node, period, round: playoffs.length - weeksBeforeFinal };
      });
    const results = new Map<string, { winner: string; loser: string }>();
    const alreadyScheduled = new Map(playoffs.flatMap(({ matchups }) => matchups).map((game) => [game.bracketSlot, game]));
    const resolve = (reference: string) => {
      const [type, key] = reference.split("_");
      if (type === "SEED") return ranked[Number(key) - 1]?.teamId;
      return type === "WINNER" ? results.get(key)?.winner : results.get(key)?.loser;
    };

    for (const { id: periodId } of playoffs) {
      const nodes = bracket.filter(({ period }) => period.id === periodId);
      const pending = nodes.filter(({ key }) => !alreadyScheduled.has(key));
      if (pending.length) {
        const data = pending.map((node) => {
          const homeTeamId = resolve(node.home);
          const awayTeamId = resolve(node.away);
          if (!homeTeamId || !awayTeamId) throw new Error("The bracket is missing a finalized qualifying result.");
          return {
            leagueId: competition.leagueId, periodId, sport: competition.sport,
            homeTeamId, awayTeamId, homeSeed: seeds.get(homeTeamId)!.rank, awaySeed: seeds.get(awayTeamId)!.rank,
            isPlayoff: true, playoffRound: node.round, bracketSlot: node.key,
          };
        });
        const created = await tx.matchup.createMany({ data });
        return { status: "SCHEDULED" as const, created: created.count };
      }
      for (const node of nodes) {
        const game = alreadyScheduled.get(node.key)!;
        if (!finalized(game)) return { status: "PENDING_PLAYOFF_RESULTS" as const, created: 0 };
        const winner = playoffWinner(game, games, seeds, config.playoffTiebreakers);
        results.set(node.key, { winner, loser: winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId });
      }
    }

    const places = new Map<string, number>();
    for (const { key, placementRange: [high, low] } of bracket) {
      if (low - high !== 1) continue;
      const { winner, loser } = results.get(key)!;
      places.set(winner, high);
      places.set(loser, low);
    }
    const fixedPlaces = new Set(places.values());
    const openPlaces = ranked.map(({ rank }) => rank).filter((rank) => !fixedPlaces.has(rank));
    const eliminated = new Map<string, number>();
    for (const node of bracket.filter(({ key }) => key.startsWith("CHAMP") && !key.endsWith("THIRD") && !key.endsWith("FIFTH"))) {
      const result = results.get(node.key);
      if (result) eliminated.set(result.loser, node.round);
    }
    const remaining = ranked.filter(({ teamId }) => !places.has(teamId)).sort((a, b) =>
      (eliminated.get(b.teamId) ?? 0) - (eliminated.get(a.teamId) ?? 0) || a.rank - b.rank);
    for (const row of remaining) places.set(row.teamId, openPlaces.shift()!);
    const placements = ranked.map((row) => ({
      teamId: row.teamId, placement: places.get(row.teamId)!,
      qualified: row.rank <= config.playoffTeams, seed: row.rank, regularPfTenths: row.pointsFor, regularPaTenths: row.pointsAgainst,
    }));
    await tx.sportFinalPlacement.createMany({ data: placements.map((row) => ({
      sportCompetitionId: competition.id, teamId: row.teamId, placement: row.placement,
      qualifiedForPlayoffs: row.qualified, initialSeed: row.seed, regularPfTenths: row.regularPfTenths,
      regularPaTenths: row.regularPaTenths, finalizedAt: now,
    })) });
    const awards = championshipPointAwards(placements, {
      qualification: config.qualificationPoints, champion: config.championPoints, runnerUp: config.runnerUpPoints,
      third: config.thirdPlaceEnabled ? config.thirdPlacePoints : 0, highestPf: config.highestPfPoints, lowestPf: config.lowestPfPoints,
    });
    await tx.championshipPointAward.createMany({ data: awards.map(({ teamId, points, type }) => ({
      sportCompetitionId: competition.id, teamId, awardType: type,
      pointsNumerator: points.numerator, pointsDenominator: points.denominator, projected: false, finalizedAt: now,
    })) });
    await tx.sportCompetition.update({ where: { id: competition.id }, data: {
      status: "FINALIZED", statusReason: "Sport placements and championship points are final.", finalizedAt: now,
    } });
    await refreshH2HChampionship(tx, config.championshipCycleId, now);
    return { status: "FINALIZED" as const, created: 0 };
  }, { isolationLevel: "Serializable", timeout: 20_000 });
}
