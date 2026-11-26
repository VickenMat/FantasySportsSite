import {readFile,writeFile} from "node:fs/promises";
import pg from "pg";
import {getDatabase} from "@/lib/db";
import {assertFixtureDatabase} from "@/ingestion/persist";
import {reconcileHistoricalPositions} from "@/server/historical-position-reconciliation";
assertFixtureDatabase();
const db=getDatabase(),client=new pg.Client({connectionString:process.env.DATABASE_URL});
const schema=new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
await client.connect();await client.query(`SET search_path TO ${quote(schema)}`);
try{
 const manifest=JSON.parse(await readFile("data/position_enrichment/mlb_review_manifest.json","utf8"));
 const expected=JSON.parse(await readFile("data/position_enrichment/mlb_backfill_preview.json","utf8"));
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[schema])).rows as {tablename:string}[];
 const snapshot=async(table:string)=>{const condition=["ImportBatch","PlayerGameStat"].includes(table)?` WHERE id IN (SELECT id FROM ${quote(`baseline_${table}`)})`:"";return(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${quote(table)} t${condition}`)).rows[0];};
 for(const table of ["ImportBatch","PlayerGameStat"])await client.query(`CREATE TEMP TABLE ${quote(`baseline_${table}`)} AS SELECT id FROM ${quote(table)}`);
 const before=new Map();for(const {tablename}of tables)before.set(tablename,await snapshot(tablename));
 const dry=await reconcileHistoricalPositions(manifest);
 if(dry.changes!==0&&dry.fingerprint!==expected.fingerprint)throw new Error("Populated-copy target fingerprint differs from reviewed development dry run.");
 const applied=dry.changes===0?{...dry,applied:false}:await reconcileHistoricalPositions(manifest,{expectedFingerprint:dry.fingerprint});
 for(const {tablename}of tables)if(JSON.stringify(await snapshot(tablename))!==JSON.stringify(before.get(tablename)))throw new Error(`Original rows changed: ${tablename}`);
 const revisions=await client.query(`SELECT count(*)::int AS count FROM "PlayerGameStat" n JOIN "PlayerGameStat" p ON p.id=n."priorRevisionId" WHERE n.id NOT IN (SELECT id FROM "baseline_PlayerGameStat") AND n.normalized=p.normalized AND n."sourceKnownAt" IS NOT DISTINCT FROM p."sourceKnownAt" AND n."gameId"=p."gameId" AND n."playerId"=p."playerId" AND n.role=p.role AND n.revision=p.revision+1`);
 if(revisions.rows[0].count!==applied.changes)throw new Error("Repair changed statistics, identity, role or official publication.");
 const repeat=await reconcileHistoricalPositions(manifest);
 if(repeat.changes!==0)throw new Error("Repair is not idempotent.");
 const report={...applied,alreadyApplied:dry.changes===0,preservedTables:tables.length,oldRowsUnchanged:true,normalizedStatisticsUnchanged:true,officialPublicationUnchanged:true,currentEligibilityChanges:0,repeatChanges:repeat.changes,targetDatabase:"fantasy_evolution_test",targetSchema:schema};
 await writeFile("data/position_enrichment/mlb_disposable_validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{await client.end();await db.$disconnect();}
