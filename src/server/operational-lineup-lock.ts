import type { Prisma } from '@/generated/prisma/client';
import { professionalGameProjection } from './professional-game-state';
/** Mutation guard is independent of snapshot/availability completeness.
 * Original fantasy-week attribution never limits a postponed game's real-time lock. */
export async function assertOperationalPlayerUnlocked(tx:Prisma.TransactionClient,leagueId:string,playerId:string,at:Date){
 const [result]=await tx.$queryRaw<{locked:boolean}[]>`SELECT EXISTS(
  SELECT 1 FROM "CompetitionPeriodGame" assignment
  JOIN "SportCompetition" competition ON competition.id=assignment."sportCompetitionId"
  JOIN "Game" game ON game.id=assignment."gameId" ${professionalGameProjection(at)}
  WHERE competition."leagueId"=${leagueId}::uuid AND competition.status<>'FINALIZED'
    AND source_start."resolvedStart"<=${at} AND source_state.status IS DISTINCT FROM 'FINAL' AND source_state.status IS DISTINCT FROM 'CANCELLED'
    AND (
      EXISTS(SELECT 1 FROM "PlayerGameStat" stat WHERE stat."gameId"=game.id AND stat."playerId"=${playerId}::uuid)
      OR EXISTS(SELECT 1 FROM "PlayerAvailabilityEvidence" evidence WHERE evidence."gameId"=game.id AND evidence."playerId"=${playerId}::uuid AND evidence."knownAt"<=${at})
      OR EXISTS(
        SELECT 1 FROM (
          SELECT DISTINCT ON(observation.provider,observation."entityKey") decision.targets,observation.normalized
          FROM "ProfessionalDataObservation" observation
          JOIN LATERAL(SELECT outcome,targets FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=observation.id AND receipt."decidedAt"<=${at} ORDER BY version DESC LIMIT 1) decision ON decision.outcome='ACCEPTED'
          WHERE (observation.category='TEAM_ASSIGNMENT' OR (observation.category='PLAYER_SNAPSHOT' AND observation.normalized->'facet'->>'type'='TEAM_ASSIGNMENT')) AND observation.sport=game.sport AND decision.targets->>'playerId'=${playerId}
            AND decision.targets->>'seasonId'=game."seasonId"::text AND (
              (observation."publishedAt"<=${at} AND observation."effectiveAt"<=${at})
              OR ((decision.targets->>'operationalEffectiveAt')::timestamptz<=${at} AND (decision.targets->>'firstObservedAt')::timestamptz<=${at})
            )
            AND NOT EXISTS(
              SELECT 1 FROM "ProfessionalDataObservation" newer
              JOIN LATERAL(SELECT outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=newer.id AND receipt."decidedAt"<=${at} ORDER BY version DESC LIMIT 1) newer_decision ON true
              WHERE newer.provider=observation.provider AND newer.sport=observation.sport AND newer.category=observation.category
                AND newer."entityKey"=observation."entityKey" AND newer."observedAt"<=${at} AND newer_decision.outcome<>'ACCEPTED'
                AND (newer."revisionOrdinal">observation."revisionOrdinal" OR (newer."revisionOrdinal"=observation."revisionOrdinal" AND newer.id<>observation.id))
            )
          ORDER BY observation.provider,observation."entityKey",observation."revisionOrdinal" DESC NULLS LAST,observation."publishedAt" DESC
        ) assignment JOIN "GameTeam" participant ON participant."gameId"=game.id AND participant."teamId"::text=assignment.targets->>'teamId'
        WHERE COALESCE((assignment.normalized->>'retracted')::boolean,false)=false
          AND (assignment.normalized->>'validUntil' IS NULL OR (assignment.normalized->>'validUntil')::timestamptz>${at})
      )
    )
 ) AS locked`;
 if(result?.locked)throw Error('This player is locked because their professional game has started or reached its conservative scheduled lock.');
}
