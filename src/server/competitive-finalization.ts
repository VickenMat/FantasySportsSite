import { getDatabase } from "@/lib/db";
import { periodPublicationTime, scoreCapturedStarters } from "./competition-scoring";
import { recordCompetitionDraw } from "./competition";
import { advanceSportPlayoffs } from "./playoffs";
import { runBackgroundJob } from "./background-jobs";

export async function finalizeCumulativeSport(competitionId: string, at = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const competition = await tx.sportCompetition.findUniqueOrThrow({ where: { id: competitionId }, include: { configSnapshot: true, leagueSportSeason: true, periods: true, league: { include: { teams: true } } } });
    if (competition.configSnapshot.competitionType !== "CUMULATIVE") throw new Error("This finalizer requires cumulative competition.");
    if (competition.finalizedAt) return { status: "FINALIZED" as const };
    const end = competition.leagueSportSeason.scoringEndsAt;
    if (!end || end > at || !competition.periods.length) return { status: "PENDING_DATA" as const, reason: "A completed source-backed sport scoring window is required." };
    const points = new Map(competition.league.teams.map(({ id }) => [id, 0n]));
    for (const period of competition.periods) {
      const publication = await periodPublicationTime(tx, period.id, at);
      if (!publication) return { status: "PENDING_DATA" as const, reason: "Verified game completion and official initial score publication are required for every period." };
      const deadline = new Date(+publication + 86400000);
      if (deadline > at) return { status: "PROVISIONAL" as const, reason: "The source-backed 24-hour correction window remains open." };
      const scores = await scoreCapturedStarters(tx, [competitionId], at, { periodId: period.id, publicationThrough: deadline });
      if (!scores.length || scores.some(({ pendingStarters }) => pendingStarters > 0)) return { status: "PENDING_DATA" as const, reason: "One or more captured starter scores are unavailable." };
      for (const score of scores) points.set(score.teamId, (points.get(score.teamId) ?? 0n) + score.pointsFor);
    }
    const draw = await recordCompetitionDraw(tx, competition.leagueId, "CUMULATIVE_SPORT_FINAL", competitionId, [...points.keys()]);
    const ranks = new Map(draw.map(({ teamId, drawRank }) => [teamId, drawRank]));
    const rows = [...points].sort(([a, ap], [b, bp]) => ap === bp ? ranks.get(a)! - ranks.get(b)! : ap > bp ? -1 : 1);
    await tx.sportFinalPlacement.createMany({ data: rows.map(([teamId, regularPfTenths], index) => ({ sportCompetitionId: competitionId, teamId, placement: index + 1, regularPfTenths, finalizedAt: at })) });
    await tx.sportCompetition.update({ where: { id: competitionId }, data: { status: "FINALIZED", finalizedAt: at, statusReason: "Frozen cumulative starter totals after verified completion and the official correction window." } });
    return { status: "FINALIZED" as const };
  }, { isolationLevel: "Serializable" });
}
export async function finalizeCumulativeCycle(cycleId: string, at = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const cycle = await tx.championshipCycle.findUniqueOrThrow({ where: { id: cycleId }, include: { league: { include: { teams: true, sports: true } }, competitionConfigs: { orderBy: { version: "desc" }, take: 1 }, sportSeasons: { include: { competition: { include: { placements: true } } } } } });
    if (cycle.status === "COMPLETE") return { status: "FINALIZED" };
    const config = cycle.competitionConfigs[0];
    if (config?.competitionType !== "CUMULATIVE") throw new Error("Cumulative championship configuration is required.");
    const competitions = cycle.sportSeasons.flatMap(({ competition }) => competition ? [competition] : []);
    if (competitions.length !== cycle.league.sports.length || competitions.some((row) => !row.finalizedAt || row.placements.length !== cycle.league.teams.length)) return { status: "PENDING_SPORTS" };
    const rows = cycle.league.teams.map(({ id }) => ({ teamId: id, points: 0n, first: 0, second: 0, third: 0 }));
    for (const competition of competitions) for (const placement of competition.placements) {
      const row = rows.find(({ teamId }) => teamId === placement.teamId)!;
      row.points += placement.regularPfTenths;
      if (placement.placement === 1) row.first++;
      if (placement.placement === 2) row.second++;
      if (placement.placement === 3) row.third++;
    }
    const draw = await recordCompetitionDraw(tx, cycle.leagueId, "OVERALL_CUMULATIVE_FINAL", cycleId, rows.map(({ teamId }) => teamId));
    const rank = new Map(draw.map(({ teamId, drawRank }) => [teamId, drawRank]));
    const compare = (a: typeof rows[number], b: typeof rows[number]) => {
      for (const rule of config.overallTiebreakers) {
        const value = rule === "COMBINED_UBP" ? b.points - a.points : rule === "FIRST_PLACE_FINISHES" ? b.first - a.first : rule === "SECOND_PLACE_FINISHES" ? b.second - a.second : rule === "THIRD_PLACE_FINISHES" ? b.third - a.third : rule === "RECORDED_DRAW" ? rank.get(a.teamId)! - rank.get(b.teamId)! : null;
        if (value === null) throw new Error(`Unsupported cumulative tiebreaker ${rule}`);
        if (value) return value > 0 ? 1 : -1;
      }
      throw new Error("Overall cumulative champion requires a final deterministic tiebreaker.");
    };
    rows.sort(compare);
    await tx.championshipResult.createMany({ data: rows.map((row, index) => ({ championshipCycleId: cycle.id, teamId: row.teamId, combinedUbpTenths: row.points, sportChampionships: row.first, runnerUpFinishes: row.second, thirdPlaceFinishes: row.third, rank: index + 1, projected: false, finalizedAt: at })) });
    await tx.championshipCycle.update({ where: { id: cycleId }, data: { status: "COMPLETE" } });
    return { status: "FINALIZED" };
  }, { isolationLevel: "Serializable" });
}
export async function processCompetitiveFinalization(at = new Date()) {
  const db = getDatabase();
  const competitions = await db.sportCompetition.findMany({ where: { finalizedAt: null, periods: { some: {} } }, include: { configSnapshot: true } });
  const outcomes = [];
  for (const competition of competitions) outcomes.push(await runBackgroundJob(`competition-finalize:${competition.id}:${at.toISOString().slice(0, 16)}`, "competition-finalization", async () => {
    if (competition.configSnapshot.competitionType === "CUMULATIVE") {
      const result = await finalizeCumulativeSport(competition.id, at);
      if (result.status === "FINALIZED") await finalizeCumulativeCycle(competition.configSnapshot.championshipCycleId, at);
      return result;
    }
    const commissioner = await db.leagueMember.findFirstOrThrow({ where: { leagueId: competition.leagueId, role: "COMMISSIONER" } });
    return advanceSportPlayoffs(commissioner.userId, competition.id, at);
  }, at));
  const cycles = await db.championshipCycle.findMany({ where: { status: { not: "COMPLETE" }, competitionConfigs: { some: { competitionType: "CUMULATIVE" } } } });
  for (const cycle of cycles) outcomes.push(await runBackgroundJob(`cumulative-cycle:${cycle.id}:${at.toISOString().slice(0, 16)}`, "cycle-finalization", () => finalizeCumulativeCycle(cycle.id, at), at));
  return outcomes;
}
