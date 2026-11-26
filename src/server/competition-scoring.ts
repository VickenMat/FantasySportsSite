import { activeFranchises } from "./franchise-participation";
import { Prisma, type Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { professionalGameProjection } from "./professional-game-state";

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
  const totals = await tx.$queryRaw<StarterTotal[]>`
    SELECT snapshot."sportCompetitionId" AS "competitionId",
      snapshot."scoringPeriodId" AS "periodId", snapshot."teamId",
      COALESCE(SUM(score."totalTenths"), 0)::bigint AS "pointsFor",
      COUNT(score."totalTenths")::integer AS "scoredStarters",
      COUNT(*) FILTER (WHERE score."totalTenths" IS NULL OR NOT score.complete OR selection."lastFailure" IS NOT NULL
        OR (source_state.sources>0 AND source_start."resolvedStart" IS NULL))::integer AS "pendingStarters"
    FROM "GameLineupSnapshot" snapshot
    JOIN "Game" game ON game.id = snapshot."gameId"
    ${professionalGameProjection(through)}
    JOIN "League" league ON league.id = snapshot."leagueId"
    LEFT JOIN "ProfessionalSyncState" selection ON selection.provider='internal-source-selection' AND selection.sport=game.sport
      AND selection.stream='game:' || game.id::text || ':player:' || snapshot."playerId"::text AND selection."nextPollAt"<=${through}
    LEFT JOIN "ScoreLedger" ledger ON ledger."gameId" = snapshot."gameId"
      AND ledger."playerId" = snapshot."playerId" AND ledger."presetId" = league."presetId"
      AND COALESCE(snapshot.eligibility->'eligible', snapshot.eligibility->'available') = 'true'::jsonb
    LEFT JOIN LATERAL (
      SELECT entry."totalTenths", cardinality(entry."missingStats") = 0 AS complete
      FROM "ScoreLedgerEntry" entry
      ${options.publicationThrough ? Prisma.sql`JOIN "PlayerGameStat" stat ON stat.id = entry."statId"` : Prisma.empty}
      WHERE entry."ledgerId" = ledger.id AND entry."calculatedAt" <= ${through}
      ${options.publicationThrough ? Prisma.sql`AND stat."sourceKnownAt" <= ${options.publicationThrough}` : Prisma.empty}
      ORDER BY entry.sequence DESC
      LIMIT 1
    ) score ON true
    WHERE snapshot."sportCompetitionId" IN (${Prisma.join(competitionIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND snapshot."isStarter" AND snapshot."lockedAt" <= ${through}
      AND source_state.status IS DISTINCT FROM 'CANCELLED'
      ${options.periodId ? Prisma.sql`AND snapshot."scoringPeriodId" = ${options.periodId}::uuid` : Prisma.empty}
    GROUP BY snapshot."sportCompetitionId", snapshot."scoringPeriodId", snapshot."teamId"
  `;
  const corrections = totals.length ? await tx.commissionerAuditEvent.findMany({ where: { action: "CORRECT_PERIOD_SCORE", targetType: "ScoringPeriod", targetId: { in: [...new Set(totals.map(({ periodId }) => periodId))] }, effectiveAt: { lte: through } } }) : [];
  for (const entry of corrections) {
    const adjustment = entry.after as { teamId: string; deltaTenths: number };
    const total = totals.find(({ periodId, teamId }) => periodId === entry.targetId && teamId === adjustment.teamId);
    if (total) total.pointsFor += BigInt(adjustment.deltaTenths);
  }
  return totals;
}

export async function periodPublicationTime(tx: Prisma.TransactionClient, periodId: string, now: Date) {
  const [result] = await tx.$queryRaw<{ publishedAt: Date | null }[]>`
    WITH starters AS (
      SELECT source_start."resolvedStart" AS "startsAt", CASE WHEN source_state.sources = 0 THEN completion.status
        WHEN source_state.status = 'FINAL' THEN 'Final' ELSE source_state.status END AS status, ledger.id AS "ledgerId",
        current_source.provider, initial."publishedAt", selection."lastFailure" AS "sourceFailure"
      FROM "CompetitionPeriodGame" assignment
      JOIN "Game" game ON game.id = assignment."gameId"
      ${professionalGameProjection(now)}
      JOIN "SportCompetition" competition ON competition.id = assignment."sportCompetitionId"
      JOIN "League" league ON league.id = competition."leagueId"
      LEFT JOIN "GameLineupSnapshot" snapshot ON snapshot."sportCompetitionId" = competition.id
        AND snapshot."gameId" = game.id AND snapshot."isStarter" AND snapshot."lockedAt" <= ${now}
      LEFT JOIN "ScoreLedger" ledger ON ledger."gameId" = game.id AND ledger."playerId" = snapshot."playerId"
        AND ledger."presetId" = league."presetId"
        AND COALESCE(snapshot.eligibility->'eligible', snapshot.eligibility->'available') = 'true'::jsonb
      LEFT JOIN "ProfessionalSyncState" selection ON selection.provider='internal-source-selection' AND selection.sport=game.sport
        AND selection.stream='game:' || game.id::text || ':player:' || snapshot."playerId"::text AND selection."nextPollAt"<=${now}
      LEFT JOIN LATERAL (
        SELECT observation.status FROM "GameScheduleObservation" observation
        WHERE observation."gameId" = game.id AND observation."retrievedAt" <= ${now}
        ORDER BY observation."retrievedAt" DESC, observation.id DESC LIMIT 1
      ) completion ON true
      LEFT JOIN LATERAL (
        SELECT stat.provider FROM "ScoreLedgerEntry" entry
        JOIN "PlayerGameStat" stat ON stat.id = entry."statId"
        WHERE entry."ledgerId" = ledger.id AND entry."calculatedAt" <= ${now}
        ORDER BY entry.sequence DESC LIMIT 1
      ) current_source ON true
      LEFT JOIN LATERAL (
        SELECT MIN(CASE WHEN stat.raw ? 'professionalObservation' THEN (stat.raw->'professionalObservation'->>'initialPublishedAt')::timestamptz ELSE stat."sourceKnownAt" END) AS "publishedAt" FROM "ScoreLedgerEntry" entry
        JOIN "PlayerGameStat" stat ON stat.id = entry."statId"
        WHERE entry."ledgerId" = ledger.id AND stat.provider = current_source.provider
          AND entry."calculatedAt" <= ${now} AND (CASE WHEN stat.raw ? 'professionalObservation' THEN (stat.raw->'professionalObservation'->>'initialPublishedAt')::timestamptz ELSE stat."sourceKnownAt" END) BETWEEN COALESCE(source_state."completedAt",source_start."resolvedStart") AND ${now}
      ) initial ON true
      WHERE assignment."scoringPeriodId" = ${periodId}::uuid
        AND source_state.status IS DISTINCT FROM 'CANCELLED'
    ), clock AS (SELECT MAX("publishedAt") AS "publishedAt" FROM starters)
    SELECT CASE WHEN COUNT(*) > 0 AND bool_and(
      starters."startsAt" <= ${now} AND COALESCE(starters.status IN ('Final', 'Completed Early', 'final_score_present'), false)
      AND starters."publishedAt" IS NOT NULL AND starters."sourceFailure" IS NULL AND COALESCE(score.ready, false)
    ) THEN MAX(clock."publishedAt") END AS "publishedAt"
    FROM starters CROSS JOIN clock
    LEFT JOIN LATERAL (
      SELECT cardinality(entry."missingStats") = 0 AS ready FROM "ScoreLedgerEntry" entry
      JOIN "PlayerGameStat" stat ON stat.id = entry."statId"
      WHERE entry."ledgerId" = starters."ledgerId" AND stat.provider = starters.provider
        AND entry."calculatedAt" <= ${now} AND stat."sourceKnownAt" IS NOT NULL
        AND stat."sourceKnownAt" <= LEAST(clock."publishedAt" + INTERVAL '24 hours', ${now})
      ORDER BY entry.sequence DESC LIMIT 1
    ) score ON true
  `;
  return result?.publishedAt ?? null;
}

export async function periodGameActivity(tx: Prisma.TransactionClient, periodId: string, at: Date) {
  const [activity] = await tx.$queryRaw<{total:number;active:number;cancelled:number}[]>`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE source_state.status IS DISTINCT FROM 'CANCELLED')::int AS active,
    COUNT(*) FILTER (WHERE source_state.status = 'CANCELLED')::int AS cancelled
    FROM "CompetitionPeriodGame" assignment JOIN "Game" game ON game.id = assignment."gameId"
    ${professionalGameProjection(at)} WHERE assignment."scoringPeriodId" = ${periodId}::uuid`;
  return activity ?? {total:0,active:0,cancelled:0};
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
        status: true,
        sportSeasons: {
          where: { leagueSportId: sport?.id },
          select: { competition: { select: { id: true, status: true, placements: true, periods: { select: { startsAt: true } } } } },
        },
      },
    });
    const competitions = cycle?.sportSeasons.flatMap(({ competition }) => competition ? [competition] : []) ?? [];
    const ids = competitions.filter(({ status }) => status !== "FINALIZED").map(({ id }) => id);
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
    const participants = cycle?.status === "COMPLETE" ? new Set(competitions.flatMap(({ placements }) => placements.map(({ teamId }) => teamId))) : null;
    league.teams = participants ? league.teams.filter(({ id }) => participants.has(id)) : await activeFranchises(tx, leagueId, league.teams);
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
    for (const competition of competitions.filter(({ status }) => status === "FINALIZED")) for (const placement of competition.placements) {
      const team = teams.get(placement.teamId);
      if (team) team.pointsFor += placement.regularPfTenths;
    }
    const pendingSports = (sport ? 1 : league.sports.length) - competitions.filter((competition) =>
      competition.status !== "PENDING_DATA" && competition.periods.length > 0).length;
    const hasScores = scores.some(({ scoredStarters }) => scoredStarters > 0) || competitions.some(({ status }) => status === "FINALIZED");
    const hasStarted = competitions.some(({ periods }) => periods.some(({ startsAt }) => startsAt <= through));
    const finalized = competitions.length > 0 && competitions.every(({ status }) => status === "FINALIZED") && pendingSports === 0;
    const state = finalized ? "FINALIZED" : hasScores ? "PROVISIONAL" : pendingSports || hasStarted ? "PENDING_DATA" : "UPCOMING";
    const rows = [...teams.values()].sort((a, b) => a.pointsFor === b.pointsFor ? 0 : a.pointsFor > b.pointsFor ? -1 : 1);
    if (hasScores) {
      for (const [index, team] of rows.entries()) {
        const previous = rows[index - 1];
        team.rank = previous && previous.pointsFor === team.pointsFor ? previous.rank : index + 1;
      }
    }
    if (finalized) {
      const finalRanks = sport ? new Map(competitions.flatMap(({ placements }) => placements.map(({ teamId, placement }) => [teamId, placement] as const)))
        : new Map((await tx.championshipResult.findMany({ where: { championshipCycle: { leagueId, number: cycle!.number }, projected: false } })).map(({ teamId, rank }) => [teamId, rank] as const));
      for (const team of rows) team.rank = finalRanks.get(team.id) ?? team.rank;
      rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
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
