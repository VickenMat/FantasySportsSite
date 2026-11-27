import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {playerGameCandidateCtes,sameProfessionalTeam,sourceUuid} from "./professional-team-membership";
import { professionalGameProjection } from "./professional-game-state";

const releaseHoldMilliseconds = 24 * 60 * 60 * 1000;

/** Explicit historical crosswalks and applicable source team IDs link an athlete
 * to a canonical game; calendar/name similarity never creates membership. */
function linkedPlayerGame(playerId:string,at:Date){return Prisma.sql`(
 EXISTS(SELECT 1 FROM "PlayerGameStat" stat WHERE stat."playerId"=${playerId}::uuid AND stat."gameId"=game.id)
 OR EXISTS(SELECT 1 FROM "PlayerGameStat" stat JOIN "Game" historical ON historical.id=stat."gameId"
   JOIN "HistoricalGameCrosswalk" bridge ON bridge.sport=historical.sport AND bridge."archiveGameId"=historical."externalId" AND bridge."canonicalGameId"=game.id AND bridge.status='MATCHED'
   JOIN "ScheduleImportBatch" batch ON batch.id=bridge."importBatchId" AND batch.status='COMPLETE' AND batch."importerVersion"='schedule-v5-1'
   WHERE stat."playerId"=${playerId}::uuid AND historical.sport=game.sport AND historical."seasonId"=game."seasonId" AND bridge."importedAt"<=${at})
 OR EXISTS(SELECT 1 FROM(
   SELECT DISTINCT ON(observation.provider,observation."entityKey") observation.normalized,decision.targets,decision.outcome
   FROM player_membership_observations observation
   JOIN LATERAL(SELECT outcome,targets FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=observation.id
     AND (observation.category='TEAM_ASSIGNMENT' OR receipt."decidedAt"<=LEAST(game."startsAt",source_state."actualStartsAt")) ORDER BY version DESC LIMIT 1) decision ON true
   WHERE observation.sport=game.sport AND decision.targets->>'playerId'=${playerId} AND decision.targets->>'seasonId'=game."seasonId"::text AND (
    (observation.category='TEAM_ASSIGNMENT' AND observation."publishedAt"<=LEAST(game."startsAt",source_state."actualStartsAt") AND observation."effectiveAt"<=LEAST(game."startsAt",source_state."actualStartsAt"))
    OR(observation.category='PLAYER_SNAPSHOT' AND observation.normalized->'facet'->>'type'='TEAM_ASSIGNMENT' AND observation."observedAt"<=LEAST(game."startsAt",source_state."actualStartsAt")
      AND (decision.targets->>'operationalEffectiveAt')::timestamptz<=LEAST(game."startsAt",source_state."actualStartsAt")))
   ORDER BY observation.provider,observation."entityKey",observation."revisionOrdinal" DESC NULLS LAST,observation."observedAt" DESC,observation.id DESC
  ) membership JOIN "ProTeam" current_team ON current_team.id::text=membership.targets->>'teamId'
  JOIN "GameTeam" participant ON participant."gameId"=game.id JOIN "ProTeam" game_team ON game_team.id=participant."teamId"
  WHERE membership.outcome='ACCEPTED' AND COALESCE((membership.normalized->>'retracted')::boolean,false)=false
   AND(membership.normalized->>'validUntil' IS NULL OR(membership.normalized->>'validUntil')::timestamptz>LEAST(game."startsAt",source_state."actualStartsAt"))
   AND ${sameProfessionalTeam(Prisma.sql`${at}`)}
 )
)`;}
function knownCompletion(at:Date){return Prisma.sql`EXISTS(SELECT 1 FROM "GameCompletionEvidence" evidence WHERE evidence."gameId"=game.id AND evidence."knownAt"<=${at}
 AND(evidence.provider<>'conservative-event-policy' OR EXISTS(SELECT 1 FROM(SELECT receipt.outcome FROM "ProfessionalDataDecision" receipt
 WHERE receipt."observationId"=${sourceUuid(Prisma.sql`evidence."sourceRecord"->>'sourceObservationId'`)} AND receipt."decidedAt"<=${at} ORDER BY version DESC LIMIT 1) verified WHERE verified.outcome='ACCEPTED')))`;}
export async function pendingGameCompletionHold(tx: Prisma.TransactionClient, playerId: string, at: Date) {
  const [result] = await tx.$queryRaw<{pending:boolean}[]>`WITH ${playerGameCandidateCtes(playerId,at)},linked AS(
    SELECT game.id,season."startYear",source_start."resolvedStart" AS lock_at,source_state.sources,source_state.status,${knownCompletion(at)} AS completion_known,
      (SELECT observation.status FROM "GameScheduleObservation" observation JOIN "ScheduleImportBatch" batch ON batch.id=observation."importBatchId"
       WHERE observation."gameId"=game.id AND observation."scheduleProvider"='schedule-v5' AND observation."retrievedAt"<=${at} AND batch.status='COMPLETE' AND batch."importerVersion"='schedule-v5-1'
       ORDER BY observation."retrievedAt" DESC,observation.id DESC LIMIT 1) AS v5_status
    FROM candidate_games candidate JOIN "Game" game ON game.id=candidate.id JOIN "Season" season ON season.id=game."seasonId" ${professionalGameProjection(at)}
    WHERE game.sport=(SELECT sport FROM "Player" WHERE id=${playerId}::uuid) AND ${linkedPlayerGame(playerId,at)}
      AND(source_state.sources>0 OR EXISTS(SELECT 1 FROM "GameScheduleObservation" accepted JOIN "ScheduleImportBatch" batch ON batch.id=accepted."importBatchId"
        WHERE accepted."gameId"=game.id AND accepted."scheduleProvider"='schedule-v5' AND accepted."retrievedAt"<=${at} AND batch.status='COMPLETE' AND batch."importerVersion"='schedule-v5-1'))
  ) SELECT EXISTS(SELECT 1 FROM linked WHERE lock_at<=${at} AND("startYear"=(SELECT MAX("startYear") FROM linked WHERE lock_at<=${at}) OR status IN('LIVE','SUSPENDED'))
    AND status IS DISTINCT FROM 'CANCELLED' AND CASE WHEN sources>0 THEN status IS NULL OR status IN('LIVE','SUSPENDED','SCHEDULED','POSTPONED') OR(status='FINAL' AND NOT completion_known)
      ELSE NOT completion_known AND COALESCE(v5_status,'') NOT IN('Cancelled','CANCELED','CANCELLED','cancelled','canceled') END
  ) AS pending`;
  return result?.pending ?? false;
}

export async function releaseHoldUntil(tx: Prisma.TransactionClient, leagueId: string, playerId: string) {
  const lastRelease = await tx.rosterEntry.findFirst({
    where: { leagueId, playerId, releasedAt: { not: null } },
    orderBy: { releasedAt: "desc" },
    select: { releasedAt: true },
  });
  return lastRelease?.releasedAt ? new Date(lastRelease.releasedAt.getTime() + releaseHoldMilliseconds) : null;
}

export async function waiverHoldUntil(tx: Prisma.TransactionClient, leagueId: string, playerId: string, at = new Date()) {
  const [release, completion] = await Promise.all([
    releaseHoldUntil(tx, leagueId, playerId),
    tx.$queryRaw<{completedAt:Date}[]>`WITH ${playerGameCandidateCtes(playerId,at)} SELECT completion."completedAt" FROM candidate_games candidate JOIN "Game" game ON game.id=candidate.id JOIN "GameCompletionEvidence" completion ON completion."gameId"=game.id ${professionalGameProjection(at)}
      WHERE completion."knownAt"<=${at} AND ${linkedPlayerGame(playerId,at)} AND(completion.provider<>'conservative-event-policy' OR EXISTS(
        SELECT 1 FROM(SELECT receipt.outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=${sourceUuid(Prisma.sql`completion."sourceRecord"->>'sourceObservationId'`)} AND receipt."decidedAt"<=${at} ORDER BY version DESC LIMIT 1) verified WHERE verified.outcome='ACCEPTED'))
      ORDER BY completion."completedAt" DESC,completion."knownAt" DESC LIMIT 1`.then(rows=>rows[0]??null),
  ]);
  // completedAt on this evidence model is a hold boundary: sourceRecord explicitly
  // distinguishes EXACT_VERIFIED from approved OBSERVED_FINAL/BOUNDED_COMPLETION.
  // The projection never advertises an observed boundary as an exact actual end.
  const game = completion ? new Date(completion.completedAt.getTime() + releaseHoldMilliseconds) : null;
  return [release, game].filter((value): value is Date => Boolean(value)).sort((a, b) => Number(b) - Number(a))[0] ?? null;
}

const completionSchema = z.object({
  gameId: z.uuid(), provider: z.string().trim().min(1), externalId: z.string().trim().min(1),
  completedAt: z.date(), knownAt: z.date(), sourceRecord: z.record(z.string(), z.unknown()),
}).refine(({ completedAt, knownAt }) => knownAt >= completedAt, { message: "Completion evidence cannot be known before the game completed." });

export async function recordGameCompletionEvidence(input: z.input<typeof completionSchema>, transaction?: Prisma.TransactionClient) {
  const value = completionSchema.parse(input);
  return (transaction ?? getDatabase()).gameCompletionEvidence.create({ data: { ...value, sourceRecord: value.sourceRecord as Prisma.InputJsonValue } });
}
