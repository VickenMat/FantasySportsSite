import {Prisma} from '@/generated/prisma/client';
/** A malformed JSON reference cannot disable an indexed UUID lookup or crash a read. */
export const sourceUuid=(value:Prisma.Sql)=>Prisma.sql`CASE WHEN ${value}~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (${value})::uuid END`;
/** Native NBA participant IDs and raw ESPN side IDs on the SAME accepted MATCHED
 * V5 game establish the edge. No name, abbreviation or date similarity is used. */
export function nbaTeamBridgeCtes(at:Date,seasonScope:Prisma.Sql){return Prisma.sql`
 nba_raw_team_edges AS MATERIALIZED(
  SELECT archive."seasonId",native.id AS native_id,
   CASE participant.side WHEN 'HOME' THEN observation."sourceRecord"->>'home_team_id' ELSE observation."sourceRecord"->>'away_team_id' END AS espn_id,
   GREATEST(observation."retrievedAt",observation."importedAt",bridge."importedAt") AS known_at
  FROM "GameScheduleObservation" observation JOIN "ScheduleImportBatch" batch ON batch.id=observation."importBatchId" AND batch.status='COMPLETE' AND batch."importerVersion"='schedule-v5-1'
  JOIN "Game" archive ON archive.id=observation."gameId" AND archive.sport='NBA' AND archive.provider='v9-historical'
  JOIN "GameTeam" participant ON participant."gameId"=archive.id AND participant.side IN('HOME','AWAY')
  JOIN "ProTeam" native ON native.id=participant."teamId" AND native.provider='v9-historical' AND native.sport='NBA' AND native."externalId"~'^161061[0-9]{4}$'
  JOIN "HistoricalGameCrosswalk" bridge ON bridge.sport='NBA' AND bridge.status='MATCHED' AND bridge."canonicalGameId"=archive.id AND bridge."archiveGameId"=archive."externalId" AND bridge."scheduleExternalId"=observation."scheduleExternalId"
  JOIN "ScheduleImportBatch" accepted ON accepted.id=bridge."importBatchId" AND accepted.status='COMPLETE' AND accepted."importerVersion"='schedule-v5-1'
  WHERE observation.sport='NBA' AND observation."scheduleProvider"='schedule-v5' AND observation."sourceRecord"->>'game_id'=observation."scheduleExternalId"
   AND GREATEST(observation."retrievedAt",observation."importedAt",bridge."importedAt")<=${at} AND archive."seasonId" IN(${seasonScope})
 ),nba_team_edges AS MATERIALIZED(
  SELECT edge."seasonId",edge.native_id,edge.espn_id,MIN(edge.known_at) AS known_at FROM nba_raw_team_edges edge
  WHERE edge.espn_id~'^[0-9]+$' AND NOT EXISTS(SELECT 1 FROM nba_raw_team_edges conflict WHERE conflict."seasonId"=edge."seasonId"
   AND((conflict.native_id=edge.native_id AND conflict.espn_id IS DISTINCT FROM edge.espn_id) OR(conflict.espn_id=edge.espn_id AND conflict.native_id<>edge.native_id)))
  GROUP BY edge."seasonId",edge.native_id,edge.espn_id
 )`;
}
/** Caller aliases: game, current_team, game_team; accepted edge CTEs above. */
export function sameProfessionalTeam(knownAt:Prisma.Sql){return Prisma.sql`(
 current_team.id=game_team.id OR(
  game.sport IN('NFL','NHL','MLB') AND current_team.provider IN('v9-historical','schedule-v5') AND game_team.provider IN('v9-historical','schedule-v5') AND current_team."externalId"=game_team."externalId"
  AND((game.sport='NFL' AND current_team."externalId"~'^[A-Z]{2,4}$') OR(game.sport IN('NHL','MLB') AND current_team."externalId"~'^[0-9]+$')))
 OR(game.sport='NBA' AND EXISTS(SELECT 1 FROM nba_team_edges edge WHERE edge."seasonId"=game."seasonId" AND edge.known_at<=${knownAt}
  AND((edge.native_id=current_team.id AND game_team.provider='schedule-v5' AND game_team."externalId"=edge.espn_id)
   OR(edge.native_id=game_team.id AND current_team.provider='schedule-v5' AND current_team."externalId"=edge.espn_id))))
 )`;}
/** Coarse over-inclusion only: latest/retracted/expired membership is still checked
 * after candidate restriction at the game's original temporal boundary. */
export function playerGameCandidateCtes(playerId:string,at:Date){return Prisma.sql`
 player_membership_observations AS MATERIALIZED(
  SELECT observation.* FROM "ProfessionalDataObservation" observation
  WHERE(observation.category='TEAM_ASSIGNMENT' OR(observation.category='PLAYER_SNAPSHOT' AND observation.normalized->'facet'->>'type'='TEAM_ASSIGNMENT'))
   AND EXISTS(SELECT 1 FROM "ProfessionalDataDecision" actor WHERE actor."observationId"=observation.id AND actor.targets->>'playerId'=${playerId})
 ),source_memberships AS MATERIALIZED(
  SELECT DISTINCT observation.sport,${sourceUuid(Prisma.sql`receipt.targets->>'seasonId'`)} AS season_id,${sourceUuid(Prisma.sql`receipt.targets->>'teamId'`)} AS team_id
  FROM player_membership_observations observation JOIN "ProfessionalDataDecision" receipt ON receipt."observationId"=observation.id
  WHERE receipt.targets->>'playerId'=${playerId} AND(observation.category='TEAM_ASSIGNMENT' OR(observation.category='PLAYER_SNAPSHOT' AND observation.normalized->'facet'->>'type'='TEAM_ASSIGNMENT'))
 ),${nbaTeamBridgeCtes(at,Prisma.sql`SELECT season_id FROM source_memberships WHERE sport='NBA'`)},
 candidate_games AS MATERIALIZED(
  SELECT stat."gameId" AS id FROM "PlayerGameStat" stat WHERE stat."playerId"=${playerId}::uuid
  UNION SELECT evidence."gameId" FROM "PlayerAvailabilityEvidence" evidence WHERE evidence."playerId"=${playerId}::uuid AND evidence."gameId" IS NOT NULL AND evidence."knownAt"<=${at}
  UNION SELECT bridge."canonicalGameId" FROM "PlayerGameStat" stat JOIN "Game" historical ON historical.id=stat."gameId"
   JOIN "HistoricalGameCrosswalk" bridge ON bridge.sport=historical.sport AND bridge."archiveGameId"=historical."externalId" AND bridge.status='MATCHED' AND bridge."canonicalGameId" IS NOT NULL
   JOIN "ScheduleImportBatch" batch ON batch.id=bridge."importBatchId" AND batch.status='COMPLETE' AND batch."importerVersion"='schedule-v5-1'
   WHERE stat."playerId"=${playerId}::uuid AND bridge."importedAt"<=${at}
  UNION SELECT game.id FROM source_memberships membership JOIN "ProTeam" current_team ON current_team.id=membership.team_id
   JOIN "ProTeam" game_team ON game_team.sport=membership.sport JOIN "GameTeam" participant ON participant."teamId"=game_team.id
   JOIN "Game" game ON game.id=participant."gameId" AND game."seasonId"=membership.season_id AND game.sport=membership.sport
   WHERE ${sameProfessionalTeam(Prisma.sql`${at}`)}
 )`;}
