import { activeFranchises } from "./franchise-participation";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { addRational, rational, recordCompetitionDraw } from "./competition";
import { scoreCapturedStarters } from "./competition-scoring";

export async function refreshH2HChampionship(tx: Prisma.TransactionClient, cycleId: string, now: Date) {
  const cycle = await tx.championshipCycle.findUniqueOrThrow({
    where: { id: cycleId },
    include: {
      league: { include: { teams: { select: { id: true } }, _count: { select: { sports: true } } } },
      competitionConfigs: { orderBy: { version: "desc" }, take: 1 },
      sportSeasons: { include: { competition: { include: {
        placements: true,
        championshipAwards: { where: { projected: false, finalizedAt: { lte: now } } },
        periods: { include: { matchups: { select: { finalizedAt: true, resultFinalizesAt: true } } } },
      } } } },
    },
  });
  if (cycle.status === "COMPLETE") return;
  const config = cycle.competitionConfigs[0];
  if (config?.competitionType !== "HEAD_TO_HEAD") return;
  const competitions = cycle.sportSeasons.flatMap(({ competition }) => competition ? [competition] : []);
  const completed = competitions.filter(({ finalizedAt }) => finalizedAt != null && finalizedAt <= now);
  if (!completed.length) return;

  cycle.league.teams = await activeFranchises(tx, cycle.leagueId, cycle.league.teams);
  const rows = new Map(cycle.league.teams.map(({ id }) => [id, {
    teamId: id, points: rational(0), combinedUbpTenths: 0n, sportChampionships: 0, runnerUpFinishes: 0, thirdPlaceFinishes: 0,
  }]));
  let canFinalize = completed.length === cycle.league._count.sports;
  for (const competition of completed) {
    for (const award of competition.championshipAwards) {
      const row = rows.get(award.teamId);
      if (!row) throw new Error("A championship award references a team outside the cycle.");
      row.points = addRational(row.points, rational(award.pointsNumerator, award.pointsDenominator));
    }
    for (const placement of competition.placements) {
      const row = rows.get(placement.teamId);
      if (!row) throw new Error("A sport placement references a team outside the cycle.");
      if (placement.placement === 1) row.sportChampionships++;
      if (placement.placement === 2) row.runnerUpFinishes++;
      if (placement.placement === 3) row.thirdPlaceFinishes++;
    }
    for (const period of competition.periods) {
      const deadlines = period.matchups.flatMap((game) =>
        game.finalizedAt && game.resultFinalizesAt && game.finalizedAt <= now ? [game.resultFinalizesAt] : []);
      if (!deadlines.length || deadlines.length !== period.matchups.length) {
        canFinalize = false;
        continue;
      }
      const cutoff = new Date(Math.min(...deadlines.map(Number)));
      const frozenAt = new Date(Math.min(...period.matchups.map(({ finalizedAt }) => Number(finalizedAt))));
      const scores = await scoreCapturedStarters(tx, [competition.id], frozenAt, {
        periodId: period.id, publicationThrough: cutoff,
      });
      if (!scores.length || scores.some(({ pendingStarters }) => pendingStarters > 0)) canFinalize = false;
      for (const score of scores) {
        const row = rows.get(score.teamId);
        if (!row) throw new Error("A championship lineup references a team outside the cycle.");
        row.combinedUbpTenths += score.pointsFor;
      }
    }
  }
  const ranked = [...rows.values()];
  type Row = (typeof ranked)[number];
  const compare = (a: Row, b: Row) => {
    for (const rule of config.overallTiebreakers) {
      let comparison: bigint | number;
      switch (rule) {
        case "CHAMPIONSHIP_POINTS":
          comparison = b.points.numerator * a.points.denominator - a.points.numerator * b.points.denominator;
          break;
        case "COMBINED_UBP":
          comparison = b.combinedUbpTenths - a.combinedUbpTenths;
          break;
        case "SPORT_CHAMPIONSHIPS":
          comparison = b.sportChampionships - a.sportChampionships;
          break;
        case "RUNNER_UP_FINISHES":
          comparison = b.runnerUpFinishes - a.runnerUpFinishes;
          break;
        case "THIRD_PLACE_FINISHES":
          comparison = b.thirdPlaceFinishes - a.thirdPlaceFinishes;
          break;
        case "RECORDED_DRAW":
          return 0;
        default:
          throw new Error(`Unsupported championship tiebreaker ${rule}.`);
      }
      if (comparison > 0) return 1;
      if (comparison < 0) return -1;
    }
    return 0;
  };
  ranked.sort(compare);
  const tied = ranked.some((row, index) => index > 0 && compare(ranked[index - 1], row) === 0);
  if (canFinalize && tied) {
    if (!config.overallTiebreakers.includes("RECORDED_DRAW")) throw new Error("The championship config requires a tiebreaker.");
    const draw = await recordCompetitionDraw(tx, cycle.leagueId, "OVERALL_CHAMPIONSHIP", cycleId, [...rows.keys()]);
    const ranks = new Map(draw.map(({ teamId, drawRank }) => [teamId, drawRank]));
    ranked.sort((a, b) => compare(a, b) || ranks.get(a.teamId)! - ranks.get(b.teamId)!);
  }
  let rank = 0;
  for (const [index, { points, ...row }] of ranked.entries()) {
    if (canFinalize || index === 0 || compare(ranked[index - 1], ranked[index])) rank = index + 1;
    const data = {
      ...row, pointsNumerator: points.numerator, pointsDenominator: points.denominator, rank, projected: !canFinalize,
      finalizedAt: canFinalize ? now : null,
    };
    await tx.championshipResult.upsert({
      where: { championshipCycleId_teamId: { championshipCycleId: cycle.id, teamId: row.teamId } },
      create: { championshipCycleId: cycle.id, ...data },
      update: data,
    });
  }
  if (canFinalize) await tx.championshipCycle.update({ where: { id: cycle.id }, data: { status: "COMPLETE" } });
}

export async function getH2HChampionshipStandings(leagueId: string) {
  return getDatabase().championshipCycle.findFirst({
    where: { leagueId },
    orderBy: { number: "desc" },
    select: {
      label: true, status: true,
      championshipResults: { include: { team: { select: { name: true } } }, orderBy: [{ rank: "asc" }, { team: { name: "asc" } }] },
    },
  });
}
