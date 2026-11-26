import "dotenv/config";
import {createHash}from"node:crypto";
import {open,mkdir,readFile,writeFile,readdir}from"node:fs/promises";
import{spawnSync}from"node:child_process";
import pg from"pg";
const migration="20261126010000_professional_ingestion_foundation",sqlHash="a1ba35606bfcb47197c55df87214dd0dbe3bc5c174aacd38fa6f60808c9102e0",targetFingerprint="22d4af0837a85bc2f89906d7e480536f7836072f2e20e7d75fc374957e6244f4";
if(process.env.APPROVED_M5_RECOVERY!==targetFingerprint)throw Error("Explicit approval for the exact migration/backfill target is required.");
const url=new URL(process.env.DATABASE_URL);
if(url.pathname!=="/fantasy_evolution"||!["localhost","127.0.0.1"].includes(url.hostname)||url.searchParams.has("schema"))throw Error("Expected preserved local public development database.");
const hash=value=>createHash("sha256").update(value).digest("hex");
if(hash(await readFile(`prisma/migrations/${migration}/migration.sql`))!==sqlHash)throw Error("Reviewed migration SQL changed.");
const sourcePath="data/raw/recovered/mlb_positions_repaired.csv";
const {createReadStream}=await import("node:fs");const sourceHash=createHash("sha256");for await(const chunk of createReadStream(sourcePath))sourceHash.update(chunk);
if(sourceHash.digest("hex")!=="7d642767b45d9e26f31778ebbf0456715d785de3ad3d274ec7bee1f07b7aec72")throw Error("Recovered MLB source changed.");
const client=new pg.Client({connectionString:url.href});await client.connect();const quote=s=>'"'+s.replaceAll('"','""')+'"';
try{
 await client.query("SET default_transaction_read_only=on");
 const applied=(await client.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows.map(r=>r.migration_name);
 if(applied.length!==26)throw Error("Expected exactly 26 migrations; do not repeat a completed deployment.");
 const pending=(await readdir("prisma/migrations",{withFileTypes:true})).filter(e=>e.isDirectory()&&!applied.includes(e.name)).map(e=>e.name);
 if(JSON.stringify(pending)!==JSON.stringify([migration]))throw Error("Pending migrations differ from the single approved migration.");
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename")).rows.map(r=>r.tablename);
 const oldIds=new Map();for(const table of["ImportBatch","PlayerGameStat"])oldIds.set(table,(await client.query(`SELECT id FROM ${quote(table)}`)).rows.map(r=>r.id));
 const snapshot=async(table)=>{const ids=oldIds.get(table);return(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${quote(table)} t${ids?' WHERE id::text=ANY($1::text[])':''}`,ids?[ids]:[])).rows[0];};
 const before={};for(const table of tables)before[table]=await snapshot(table);
 await writeFile("/private/tmp/m5-approved-development-before.json",JSON.stringify(before,null,2),{mode:0o600});
 const directory="data/private_backups";if(spawnSync("git",["check-ignore",`${directory}/check.dump`]).status!==0)throw Error("Private backup destination must be excluded from Git.");await mkdir(directory,{recursive:true,mode:0o700});
 const backup=`${directory}/fantasy_evolution_pre_m5_${new Date().toISOString().replaceAll(/[:.]/g,"-")}.dump`;
 const file=await open(backup,"wx",0o600);
 try{const dump=spawnSync("docker",["exec","fantasysportssite-postgres-1","pg_dump","-U",process.env.POSTGRES_USER??"fantasy","-d","fantasy_evolution","-Fc"],{stdio:["ignore",file.fd,"pipe"]});if(dump.status!==0)throw Error(`Backup failed: ${dump.stderr}`);}finally{await file.close();}
 const bytes=await readFile(backup);
 for(const args of[["--list"],["--file=/dev/null"]]){const result=spawnSync("docker",["exec","-i","fantasysportssite-postgres-1","pg_restore",...args],{input:bytes,maxBuffer:4*1024*1024});if(result.status!==0)throw Error(`Backup validation failed: ${result.stderr}`);}
 const backupReport={path:backup,sha256:hash(bytes),bytes:bytes.length,archiveListAndFullDecodeVerified:true};
 await writeFile("/private/tmp/m5-approved-backup.json",JSON.stringify(backupReport,null,2),{mode:0o600});console.log(JSON.stringify({backup:backupReport}));
 const dry=spawnSync(process.execPath,["--import","tsx","src/workers/apply-reviewed-recovered-backfill.ts","--dry-run"],{env:process.env,encoding:"utf8"});if(dry.status!==0)throw Error(dry.stderr);console.log(dry.stdout);
 const deploy=spawnSync("npm",["run","db:deploy"],{env:process.env,stdio:"inherit"});if(deploy.status!==0)throw Error("Approved migration deployment failed. Retain backup; inspect before continuing.");
 const backfill=spawnSync(process.execPath,["--import","tsx","src/workers/apply-reviewed-recovered-backfill.ts"],{env:process.env,encoding:"utf8"});if(backfill.status!==0)throw Error(backfill.stderr);console.log(backfill.stdout);
 for(const table of tables){const after=await snapshot(table);if(JSON.stringify(after)!==JSON.stringify(before[table]))throw Error(`Original rows changed: ${table}`);}
 const count=async(table)=>(await client.query(`SELECT count(*)::int AS n FROM ${quote(table)}`)).rows[0].n;
 if(await count("PlayerGameStat")!==107312+66825||await count("ImportBatch")!==Number(before.ImportBatch.count)+1)throw Error("Unexpected approved backfill count delta.");
 const appliedAfter=(await client.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].n;if(appliedAfter!==27)throw Error("Expected 27 migrations after deployment.");
 const report={approvedTargetFingerprint:targetFingerprint,migration,sqlHash,appliedMigrations:appliedAfter,originalTablesPreserved:tables.length,originalRowsUnchanged:true,newStatRevisions:66825,playersEnriched:935,playerGameStatCount:await count("PlayerGameStat"),currentEligibilityChanges:0,scoreLedgerChanges:0,backup:backupReport};
 await writeFile("data/position_enrichment/development_application.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}finally{await client.end();}
