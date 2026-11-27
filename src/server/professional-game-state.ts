import{Prisma}from"@/generated/prisma/client";
/** Same source-consensus projection drives start locks and competitive publication.
 * Accepted V5 scheduling supplies a conservative operational fallback, never an exact actual-start claim.
 * The caller's Game alias must be `game`; this fragment performs no writes.
 */
export function professionalGameProjection(at:Date){
 return Prisma.sql`
 LEFT JOIN LATERAL (
   SELECT COUNT(*)::int AS sources,
     MIN((claim.targets->'operationalClock'->>'operationalLockAt')::timestamptz) AS "operationalLockAt",
     bool_or(COALESCE((claim.targets->>'lockReviewPending')::boolean,false)) AS "lockReviewPending",
     bool_and(COALESCE((claim.normalized->>'pregameVerified')::boolean,false)) AS "verifiedPregame",
     CASE WHEN COUNT(DISTINCT claim.normalized->>'status')=1 AND MIN(claim.normalized->>'status')='FINAL' AND NOT bool_or(claim."completionPending")
       THEN (SELECT MAX(e."completedAt") FROM "GameCompletionEvidence" e WHERE e."gameId"=game.id AND e."knownAt"<=${at}
         AND (e.provider<>'conservative-event-policy' OR EXISTS(SELECT 1 FROM(
           SELECT receipt.outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"::text=e."sourceRecord"->>'sourceObservationId' AND receipt."decidedAt"<=${at} ORDER BY receipt.version DESC LIMIT 1
         ) known WHERE known.outcome='ACCEPTED'))) END AS "operationalCompletedAt",
     COALESCE(CASE WHEN COUNT(DISTINCT (claim.normalized->>'completedAt')::timestamptz) = 1
       AND NOT bool_or(claim."completionPending")
       THEN MIN((claim.normalized->>'completedAt')::timestamptz) END,
       (SELECT CASE WHEN COUNT(DISTINCT exact."completedAt")=1 THEN MIN(exact."completedAt") END
        FROM "GameCompletionEvidence" exact WHERE exact."gameId"=game.id AND exact."knownAt"<=${at}
          AND (exact.provider<>'conservative-event-policy' OR (exact."sourceRecord"->>'precision'='EXACT_VERIFIED' AND EXISTS(SELECT 1 FROM(
            SELECT receipt.outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"::text=exact."sourceRecord"->>'sourceObservationId' AND receipt."decidedAt"<=${at} ORDER BY receipt.version DESC LIMIT 1
          ) known WHERE known.outcome='ACCEPTED'))))
     ) AS "completedAt",
     CASE WHEN COUNT(DISTINCT claim.normalized->>'status') = 1 AND NOT bool_or(claim."completionPending")
       THEN MIN(claim.normalized->>'status') END AS status,
     CASE WHEN COUNT(DISTINCT (claim.normalized->>'actualStartsAt')::timestamptz) = 1
       AND COUNT(DISTINCT claim.normalized->>'status') = 1 AND NOT bool_or(claim."completionPending")
       AND MIN(claim.normalized->>'status') IN ('LIVE','SUSPENDED','FINAL')
       THEN MIN((claim.normalized->>'actualStartsAt')::timestamptz) END AS "actualStartsAt",
     CASE WHEN COUNT(DISTINCT (claim.normalized->>'scheduledStartsAt')::timestamptz) = 1
       THEN MIN((claim.normalized->>'scheduledStartsAt')::timestamptz) END AS "scheduledStartsAt"
   FROM (
     SELECT DISTINCT ON (observation.provider) observation.normalized, decision.targets,
       COALESCE((decision.targets->>'completionPending')::boolean, false) AS "completionPending"
     FROM "ProfessionalDataObservation" observation
     JOIN LATERAL (
       SELECT outcome, targets FROM "ProfessionalDataDecision" receipt
       WHERE receipt."observationId" = observation.id
         AND (observation.normalized->>'evidencePolicy' IS DISTINCT FROM 'CONSERVATIVE_OBSERVED_V1' OR receipt."decidedAt"<=${at})
       ORDER BY receipt.version DESC LIMIT 1
     ) decision ON decision.outcome='ACCEPTED' AND decision.targets->>'gameId'=game.id::text
     WHERE observation.category = 'GAME_STATE' AND observation.sport = game.sport
       AND observation."entityKey"='game-state:'||game.id::text
       AND observation."observedAt" <= ${at} AND (
         (observation."publishedAt" <= ${at} AND observation."effectiveAt" <= ${at})
         OR observation.normalized->>'evidencePolicy'='CONSERVATIVE_OBSERVED_V1')
     ORDER BY observation.provider, observation."revisionOrdinal" DESC NULLS LAST, observation."publishedAt" DESC NULLS LAST, observation."observedAt" DESC
   ) claim
 ) source_state ON true
 LEFT JOIN LATERAL (
   SELECT MIN(LEAST((observation.normalized->>'actualStartsAt')::timestamptz,
     CASE WHEN COALESCE((decision.targets->'operationalClock'->>'started')::boolean,false) THEN (decision.targets->'operationalClock'->>'operationalLockAt')::timestamptz END)) AS "irreversibleLockAt"
   FROM "ProfessionalDataObservation" observation
   JOIN LATERAL(SELECT outcome,targets FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=observation.id
     AND (observation.normalized->>'evidencePolicy' IS DISTINCT FROM 'CONSERVATIVE_OBSERVED_V1' OR (receipt."decidedAt"<=${at} AND receipt.outcome='ACCEPTED'))
     ORDER BY version DESC LIMIT 1) decision ON decision.outcome='ACCEPTED'
   WHERE observation.category='GAME_STATE' AND observation."entityKey"='game-state:'||game.id::text AND observation.sport=game.sport AND observation."observedAt"<=${at}
 ) started ON true
 CROSS JOIN LATERAL (
   SELECT LEAST(
     source_state."actualStartsAt", source_state."operationalLockAt", started."irreversibleLockAt",
     CASE WHEN source_state."operationalLockAt" IS NOT NULL THEN source_state."operationalLockAt"
       WHEN source_state."verifiedPregame" AND source_state.status IN ('SCHEDULED','POSTPONED') AND started."irreversibleLockAt" IS NULL
       THEN source_state."scheduledStartsAt" ELSE LEAST(game."startsAt",source_state."scheduledStartsAt") END
   ) AS "resolvedStart"
 ) source_start`;
}
