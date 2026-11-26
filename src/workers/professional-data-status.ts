import "dotenv/config";
import pg from "pg";
import {providerPermissions,providerStrategy} from "@/ingestion/providers";
import {approvedGameFeeds} from "@/ingestion/game-feeds";
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')??'public';
 const {available}=(await client.query('SELECT to_regclass($1) IS NOT NULL AS available',[`"${schema.replaceAll('"','""')}"."ProfessionalSyncState"`])).rows[0];
 if(!available)console.log(JSON.stringify({status:'PENDING_MIGRATION',liveIngestion:'DISABLED',developmentWrites:false}));
 else {
  const quoted='"'+schema.replaceAll('"','""')+'"';
  const streams=(await client.query(`SELECT provider,sport,stream,cursor,"nextPollAt",failures,requests,"lastSuccessAt","lastFailure","leaseUntil" FROM ${quoted}."ProfessionalSyncState" ORDER BY provider,sport,stream`)).rows;
  const decisions=(await client.query(`SELECT outcome,count(*)::int AS revisions FROM ${quoted}."ProfessionalDataDecision" GROUP BY outcome ORDER BY outcome`)).rows;
  const freshness=(await client.query(`SELECT observation.sport,observation.category,MAX(observation."observedAt") AS "lastReceivedAt",MAX(observation."publishedAt") FILTER (WHERE observation.category='STAT' AND observation.normalized->>'publicationSemantics'='OFFICIAL_BOX_SCORE') AS "officialBoxScorePublishedAt" FROM ${quoted}."ProfessionalDataObservation" observation WHERE EXISTS(SELECT 1 FROM ${quoted}."ProfessionalDataDecision" decision WHERE decision."observationId"=observation.id AND decision.outcome='ACCEPTED') GROUP BY observation.sport,observation.category ORDER BY observation.sport,observation.category`)).rows;
  const requests=(await client.query(`SELECT count(*)::int AS "activeScheduledRequestReservations" FROM ${quoted}."RateLimitBucket" WHERE key LIKE 'professional-request:%' AND "expiresAt">now()`)).rows[0];
  console.log(JSON.stringify({status:'STAGING_ONLY',liveIngestion:'DISABLED',strategy:providerStrategy,permissions:providerPermissions,registeredProfessionalGames:approvedGameFeeds.length,streams,decisions,freshness,requests,developmentWrites:false}));
 }
 await client.query('COMMIT');
}finally{await client.end();}
