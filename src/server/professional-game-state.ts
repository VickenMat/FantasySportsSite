import{Prisma}from"@/generated/prisma/client";
/** Same source-consensus projection drives start locks and competitive publication.
 * Accepted V5 scheduling is retained as legacy fallback only when no M5 state exists.
 * The caller's Game alias must be `game`; this fragment performs no writes.
 */
export function professionalGameProjection(at:Date){
 return Prisma.sql`
 LEFT JOIN LATERAL (
   SELECT COUNT(*)::int AS sources,
     CASE WHEN COUNT(DISTINCT (claim.normalized->>'completedAt')::timestamptz) = 1
       AND NOT bool_or(claim."completionPending")
       THEN MIN((claim.normalized->>'completedAt')::timestamptz) END AS "completedAt",
     CASE WHEN COUNT(DISTINCT claim.normalized->>'status') = 1 AND NOT bool_or(claim."completionPending")
       THEN MIN(claim.normalized->>'status') END AS status,
     CASE WHEN COUNT(DISTINCT (claim.normalized->>'actualStartsAt')::timestamptz) = 1
       AND COUNT(DISTINCT claim.normalized->>'status') = 1 AND NOT bool_or(claim."completionPending")
       AND MIN(claim.normalized->>'status') IN ('LIVE','SUSPENDED','FINAL')
       THEN MIN((claim.normalized->>'actualStartsAt')::timestamptz) END AS "actualStartsAt",
     CASE WHEN COUNT(DISTINCT (claim.normalized->>'scheduledStartsAt')::timestamptz) = 1
       THEN MIN((claim.normalized->>'scheduledStartsAt')::timestamptz) END AS "scheduledStartsAt"
   FROM (
     SELECT DISTINCT ON (observation.provider) observation.normalized,
       COALESCE((decision.targets->>'completionPending')::boolean, false) AS "completionPending"
     FROM "ProfessionalDataObservation" observation
     JOIN LATERAL (
       SELECT targets FROM "ProfessionalDataDecision" receipt
       WHERE receipt."observationId" = observation.id AND receipt.outcome = 'ACCEPTED'
         AND receipt.targets->>'gameId' = game.id::text
       ORDER BY receipt.version DESC LIMIT 1
     ) decision ON true
     WHERE observation.category = 'GAME_STATE' AND observation.sport = game.sport
       AND observation."entityKey"='game-state:'||game.id::text
       AND observation."publishedAt" <= ${at} AND observation."effectiveAt" <= ${at}
     ORDER BY observation.provider, observation."revisionOrdinal" DESC NULLS LAST, observation."publishedAt" DESC
   ) claim
 ) source_state ON true
 CROSS JOIN LATERAL (
   SELECT EXISTS(SELECT 1 FROM "PlayerGameStat" stat WHERE stat."gameId"=game.id AND stat.raw ? 'professionalObservation')
     OR EXISTS(SELECT 1 FROM "ProfessionalDataObservation" identity
       WHERE identity.provider=game.provider AND identity.sport=game.sport AND identity.category='GAME_IDENTITY'
         AND identity."entityKey"='game:'||game."externalId" AND identity.normalized->>'discovery'='NEW'
         AND EXISTS(SELECT 1 FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=identity.id AND receipt.outcome='ACCEPTED' AND receipt.targets->>'gameId'=game.id::text)
     ) AS managed
 ) source_mode
 CROSS JOIN LATERAL (
   SELECT CASE WHEN source_state.sources = 0 AND NOT source_mode.managed THEN game."startsAt" ELSE source_state."actualStartsAt" END AS "resolvedStart"
 ) source_start`;
}
