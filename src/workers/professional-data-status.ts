import "dotenv/config";
import pg from "pg";
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
  console.log(JSON.stringify({status:'STAGING_ONLY',liveIngestion:'DISABLED',streams,decisions,developmentWrites:false}));
 }
 await client.query('COMMIT');
}finally{await client.end();}
