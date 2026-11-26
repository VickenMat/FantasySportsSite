import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { asyncBufferFromFile,parquetMetadataAsync,parquetSchema } from "hyparquet";
import pg from "pg";
import { parquetSources } from "@/parquet/config";
const previous=JSON.parse(await readFile('reports/m2-5-analysis.json','utf8'));
const archives=[];
for(const [sport,source] of Object.entries(parquetSources)) {
 const path=join('data/player_data',source.filename),bytes=await readFile(path);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const metadata=await parquetMetadataAsync(await asyncBufferFromFile(path));
 const prior=previous.reports.find((row:{sport:string})=>row.sport===sport);
 if(prior.source.sha256!==sha256||prior.source.parquetRows!==Number(metadata.num_rows))throw new Error(`${sport} archive differs from accepted prior audit; do not silently reuse coverage.`);
 archives.push({sport,file:source.filename,sha256,rows:Number(metadata.num_rows),columns:parquetSchema(metadata).children.map(({element})=>element.name),priorAuditVerified:true,acceptedRows:prior.totals.acceptedRows,quarantinedRows:prior.totals.quarantinedRows,seasons:prior.seasons.map((s:{season:number;rows:number;acceptedRows:number;players:number;coverage:string})=>({year:s.season,rows:s.rows,acceptedRows:s.acceptedRows,players:s.players,coverage:s.coverage}))});
}
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const canonical=(await client.query(`SELECT sport,count(*)::int AS players FROM "Player" WHERE NOT "isDemo" AND NOT "isSynthetic" GROUP BY sport ORDER BY sport`)).rows;
 const imported=(await client.query(`WITH latest AS (SELECT DISTINCT ON ("gameId","playerId",role,provider) * FROM "PlayerGameStat" ORDER BY "gameId","playerId",role,provider,revision DESC) SELECT p.sport,se."startYear",count(*)::int AS rows,count(DISTINCT p.id)::int AS players,count(*) FILTER(WHERE s."sourceKnownAt" IS NOT NULL)::int AS publication_timestamps FROM latest s JOIN "Player" p ON p.id=s."playerId" JOIN "Game" g ON g.id=s."gameId" JOIN "Season" se ON se.id=g."seasonId" WHERE NOT p."isDemo" AND NOT p."isSynthetic" AND s.provider='v9-historical' GROUP BY p.sport,se."startYear" ORDER BY p.sport,se."startYear"`)).rows;
 const mlb=(await client.query(`WITH latest AS (
 SELECT DISTINCT ON(s."gameId",s."playerId",s.role) s.* FROM "PlayerGameStat" s JOIN "Player" p ON p.id=s."playerId" WHERE p.sport='MLB' AND NOT p."isDemo" AND NOT p."isSynthetic" AND s.provider='v9-historical' ORDER BY s."gameId",s."playerId",s.role,s.revision DESC
 ), pairs AS (SELECT "gameId","playerId",bool_or(role='HITTER' AND EXISTS(SELECT 1 FROM jsonb_each(normalized) item WHERE jsonb_typeof(item.value)='number' AND (item.value::text)::numeric<>0)) AS hitter_activity,bool_or(role='PITCHER' AND EXISTS(SELECT 1 FROM jsonb_each(normalized) item WHERE jsonb_typeof(item.value)='number' AND (item.value::text)::numeric<>0)) AS pitcher_activity,bool_and((role='HITTER' AND coalesce(raw->>'category',raw->'original'->>'category')='batting') OR (role='PITCHER' AND coalesce(raw->>'category',raw->'original'->>'category')='pitching')) AS categories_match FROM latest GROUP BY "gameId","playerId" HAVING count(DISTINCT role)=2)
 SELECT md5(string_agg("gameId"::text || ':' || "playerId"::text,' ' ORDER BY "gameId","playerId")) AS target_fingerprint,count(*)::int AS appearances,count(DISTINCT "playerId")::int AS players,count(*) FILTER(WHERE hitter_activity AND pitcher_activity)::int AS both_nonzero,count(*) FILTER(WHERE NOT hitter_activity AND pitcher_activity)::int AS pitcher_only_nonzero,count(*) FILTER(WHERE hitter_activity AND NOT pitcher_activity)::int AS hitter_only_nonzero,count(*) FILTER(WHERE NOT hitter_activity AND NOT pitcher_activity)::int AS neither_nonzero,count(*) FILTER(WHERE NOT categories_match)::int AS category_mismatches FROM pairs`)).rows[0];
 const evidence=(await client.query(`SELECT (SELECT count(*)::int FROM "PlayerPositionEvidence") AS positions,(SELECT count(*)::int FROM "PlayerAvailabilityEvidence") AS availability,(SELECT count(*)::int FROM "RookieEligibilityEvidence") AS rookie,(SELECT count(*)::int FROM "GameCompletionEvidence") AS completion,(SELECT count(*)::int FROM "ProfessionalSeasonScheduleRevision" WHERE status='AVAILABLE') AS available_season_revisions`)).rows[0];
 const output={reportVersion:'m5-baseline-2',generatedAt:new Date().toISOString(),archiveRows:archives.reduce((sum,row)=>sum+row.rows,0),archives,canonical,imported,mlbAmbiguity:mlb,evidence,developmentWrites:false};
 await client.query('COMMIT');
 const destination=process.argv[2]??'/private/tmp/fantasy-m5-data-baseline.json';
 await writeFile(destination,JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({output:destination,archiveRows:output.archiveRows,canonical,imported,mlbAmbiguity:mlb,evidence}));
} finally {await client.end();}
