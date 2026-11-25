import { Prisma, type Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

type StarterTotal = {
  competitionId: string;
  periodId: string;
  teamId: string;
  pointsFor: bigint;
  scoredStarters: number;
  pendingStarters: number;
};

export async function scoreCapturedStarters(
  tx: Prisma.TransactionClient,
  competitionIds: readonly string[],
  through: Date,
  options: { periodId?: string; publicationThrough?: Date } = {},
) {
  if (!competitionIds.length) return [];
  return tx.$queryRaw<StarterTotal[]>`
    SELECT snapshot."sportCompetitionId" AS "competitionId",
      snapshot."scoringPeriodId" AS "periodId", snapshot."teamId",
      COALESCE(SUM(score."totalTenths"), 0)::bigint AS "pointsFor",
      COUNT(score."totalTenths")::integer AS "scoredStarters",
      (COUNT(*) - COUNT(score."totalTenths"))::integer AS "pendingStarters"
    FROM "GameLineupSnapshot" snapshot
    JOIN "League" league ON league.id = snapshot."leagueId"
    LEFT JOIN "ScoreLedger" ledger ON ledger."gameId" = snapshot."gameId"
      AND ledger."playerId" = snapshot."playerId" AND ledger."presetId" = league."presetId"
      AND COALESCE(snapshot.eligibility->'eligible', snapshot.eligibility->'available') = 'true'::jsonb
    LEFT JOIN LATERAL (
      SELECT entry."totalTenths"
      FROM "ScoreLedgerEntry" entry
      ${options.publicationThrough ? Prisma.sql`JOIN "PlayerGameStat" stat ON stat.id = entry."statId"` : Prisma.empty}
      WHERE entry."ledgerId" = ledger.id AND entry."calculatedAt" <= ${through}
      ${options.publicationThrough ? Prisma.sql`AND stat."sourceKnownAt" <= ${options.publicationThrough}` : Prisma.empty}
      ORDER BY entry.sequence DESC
      LIMIT 1
    ) score ON true
    WHERE snapshot."sportCompetitionId" IN (${Prisma.join(competitionIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND snapshot."isStarter" AND snapshot."lockedAt" <= ${through}
      ${options.periodId ? Prisma.sql`AND snapshot."scoringPeriodId" = ${options.periodId}::uuid` : Prisma.empty}
    GROUP BY snapshot."sportCompetitionId", snapshot."scoringPeriodId", snapshot."teamId"
  `;
}

export async function periodPublicationTime(tx: Prisma.TransactionClient, periodId: string, now: Date) {
  const [result] = await tx.$queryRaw<{ publishedAt: Date | null }[]>`
    SELECT CASE WHEN bool_and(
      game."startsAt" <= ${now} AND completion.status IN ('Final', 'Completed Early', 'final_score_present')
      AND score.ready
    ) AND COUNT(*) = COUNT(*) FILTER (WHERE completion.status IS NOT NULL AND score.ready)
    THEN MAX(score."publishedAt") END AS "publishedAt"
    FROM "CompetitionPeriodGame" assignment
    JOIN "Game" game ON game.id = assignment."gameId"
    JOIN "SportCompetition" competition ON competition.id = assignment."sportCompetitionId"
    JOIN "League" league ON league.id = competition."leagueId"
    LEFT JOIN LATERAL (
      SELECT observation.status
      FROM "GameScheduleObservation" observation
      WHERE observation."gameId" = game.id AND observation."retrievedAt" <= ${now}
      ORDER BY observation."retrievedAt" DESC, observation.id DESC
      LIMIT 1
    ) completion ON true
    JOIN LATERAL (
      SELECT MAX(stat."sourceKnownAt") AS "publishedAt",
        COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (
          WHERE stat."sourceKnownAt" BETWEEN game."startsAt" AND ${now}
        ) AS ready
      FROM "GameLineupSnapshot" snapshot
      LEFT JOIN "ScoreLedger" ledger ON ledger."gameId" = game.id
        AND ledger."playerId" = snapshot."playerId" AND ledger."presetId" = league."presetId"
        AND COALESCE(snapshot.eligibility->'eligible', snapshot.eligibility->'available') = 'true'::jsonb
      LEFT JOIN "ScoreLedgerEntry" entry ON entry."ledgerId" = ledger.id AND entry.sequence = 1
        AND entry."calculatedAt" <= ${now}
      LEFT JOIN "PlayerGameStat" stat ON stat.id = entry."statId"
      WHERE snapshot."sportCompetitionId" = competition.id AND snapshot."gameId" = game.id AND snapshot."isStarter"
    ) score ON true
    WHERE assignment."scoringPeriodId" = ${periodId}::uuid
  `;
  return result?.publishedAt ?? null;
}

type CumulativeSelection = { sport?: Sport; cycleNumber?: number };

export function getCumulativeStandings(leagueId: string, selection: CumulativeSelection = {}, through = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const league = await tx.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: {
        competitionType: true,
        sports: { select: { id: true, seasonId: true, sport: true } },
        teams: { orderBy: [{ name: "asc" }, { id: "asc" }] },
      },
    });
    if (league.competitionType !== "CUMULATIVE") throw new Error("Cumulative standings require a cumulative league.");
    const sport = selection.sport ? league.sports.find((value) => value.sport === selection.sport) : undefined;
    if (selection.sport && !sport) throw new Error("That sport is unavailable in this league.");
    const cycle = await tx.championshipCycle.findFirst({
      where: {
        leagueId,
        number: selection.cycleNumber,
        sportSeasons: sport && selection.cycleNumber === undefined
          ? { some: { leagueSportId: sport.id, seasonId: sport.seasonId } }
          : undefined,
      },
      orderBy: { number: "desc" },
      select: {
        number: true,
        label: true,
        sportSeasons: {
          where: { leagueSportId: sport?.id },
          select: { competition: { select: { id: true, status: true, periods: { select: { startsAt: true } } } } },
        },
      },
    });
    const competitions = cycle?.sportSeasons.flatMap(({ competition }) => competition ? [competition] : []) ?? [];
    const ids = competitions.map(({ id }) => id);
    const scores = await scoreCapturedStarters(tx, ids, through);
    const pendingGames = ids.length ? await tx.competitionPeriodGame.count({
      where: {
        sportCompetitionId: { in: ids },
        game: { startsAt: { lte: through } },
        NOT: {
          game: { lineupSnapshots: { some: { sportCompetitionId: { in: ids } } } },
        },
      },
    }) : 0;
    const teams = new Map(league.teams.map((team) => [team.id, {
      ...team, pointsFor: 0n, scoredStarters: 0, pendingStarters: 0, rank: null as number | null,
    }]));
    for (const score of scores) {
      const team = teams.get(score.teamId);
      if (!team) continue;
      team.pointsFor += score.pointsFor;
      team.scoredStarters += score.scoredStarters;
      team.pendingStarters += score.pendingStarters;
    }
    const pendingSports = (sport ? 1 : league.sports.length) - competitions.filter((competition) =>
      competition.status !== "PENDING_DATA" && competition.periods.length > 0).length;
    const hasScores = scores.some(({ scoredStarters }) => scoredStarters > 0);
    const hasStarted = competitions.some(({ periods }) => periods.some(({ startsAt }) => startsAt <= through));
    const state = hasScores ? "PROVISIONAL" : pendingSports || hasStarted ? "PENDING_DATA" : "UPCOMING";
    const rows = [...teams.values()].sort((a, b) => a.pointsFor === b.pointsFor ? 0 : a.pointsFor > b.pointsFor ? -1 : 1);
    if (hasScores) {
      for (const [index, team] of rows.entries()) {
        const previous = rows[index - 1];
        team.rank = previous && previous.pointsFor === team.pointsFor ? previous.rank : index + 1;
      }
    }
    return {
      cycle: cycle ? { number: cycle.number, label: cycle.label } : null,
      state,
      pendingGames,
      pendingSports,
      rows,
    };
  }, { isolationLevel: "RepeatableRead" });
}
