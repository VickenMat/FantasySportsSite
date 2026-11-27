import { Prisma } from '@/generated/prisma/client';
import {nbaTeamBridgeCtes,sameProfessionalTeam,sourceUuid} from './professional-team-membership';
/** A player/game link proves membership only; it never asserts health, participation or eligibility. */
export async function professionalGamePlayers(tx:Prisma.TransactionClient,gameId:string,at:Date){
 const [stats,availability,teams]=await Promise.all([
  tx.playerGameStat.findMany({where:{gameId},distinct:['playerId'],select:{playerId:true,id:true}}),
  tx.playerAvailabilityEvidence.findMany({where:{gameId,knownAt:{lte:at},effectiveAt:{lte:at},OR:[{expiresAt:null},{expiresAt:{gt:at}}]},orderBy:[{knownAt:'desc'},{effectiveAt:'desc'},{createdAt:'desc'}]}),
  tx.$queryRaw<{playerId:string;observationId:string}[]>`WITH ${nbaTeamBridgeCtes(at,Prisma.sql`SELECT "seasonId" FROM "Game" WHERE id=${gameId}::uuid`)} SELECT DISTINCT source.targets->>'playerId' AS "playerId",source.id AS "observationId" FROM (
   SELECT DISTINCT ON(observation.provider,observation."entityKey") observation.id,observation.normalized,decision.targets,decision.outcome
   FROM "ProfessionalDataObservation" observation JOIN "Game" game ON game.id=${gameId}::uuid AND game.sport=observation.sport
   JOIN LATERAL(SELECT outcome,targets FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=observation.id AND receipt."decidedAt"<=${at} ORDER BY version DESC LIMIT 1) decision ON true
   WHERE observation."observedAt"<=${at} AND (observation.category='TEAM_ASSIGNMENT' OR (observation.category='PLAYER_SNAPSHOT' AND observation.normalized->'facet'->>'type'='TEAM_ASSIGNMENT'))
   ORDER BY observation.provider,observation."entityKey",observation."revisionOrdinal" DESC NULLS LAST,observation."observedAt" DESC
  ) source JOIN "Game" game ON game.id=${gameId}::uuid JOIN "ProTeam" current_team ON current_team.id=${sourceUuid(Prisma.sql`source.targets->>'teamId'`)} JOIN "GameTeam" participant ON participant."gameId"=game.id JOIN "ProTeam" game_team ON game_team.id=participant."teamId"
  WHERE ${sameProfessionalTeam(Prisma.sql`${at}`)} AND source.outcome='ACCEPTED' AND source.targets->>'seasonId'=game."seasonId"::text
   AND COALESCE((source.normalized->>'retracted')::boolean,false)=false
   AND (source.normalized->>'validUntil' IS NULL OR (source.normalized->>'validUntil')::timestamptz>${at})
   AND (COALESCE((source.targets->>'operationalEffectiveAt')::timestamptz,(source.normalized->>'effectiveAt')::timestamptz)<=${at}
     OR source.normalized->>'kind'='TEAM_ASSIGNMENT')
   AND (source.targets->>'firstObservedAt' IS NULL OR (source.targets->>'firstObservedAt')::timestamptz<=${at})`
 ]);
 const links=new Map<string,{statId?:string;availabilityId?:string;teamObservationId?:string}>();
 for(const stat of stats)links.set(stat.playerId,{statId:stat.id});
 for(const evidence of availability)if(!links.get(evidence.playerId)?.availabilityId)links.set(evidence.playerId,{...links.get(evidence.playerId),availabilityId:evidence.id});
 for(const team of teams)links.set(team.playerId,{...links.get(team.playerId),teamObservationId:team.observationId});
 return{links,availability};
}
