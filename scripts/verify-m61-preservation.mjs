/** Read-only development preservation. Does not stop/restart or mutate workers. */
import 'dotenv/config';
import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const argument=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const baselinePath=argument('--before','data/operations/m61_before_preservation.json');
const output=argument('--output','reports/m61-preservation.json');
const before=JSON.parse(await readFile(baselinePath,'utf8'));
if(before.database!=='fantasy_evolution')throw Error('Expected development preservation baseline.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
await db.connect();
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 if((await db.query('SELECT current_database() AS name')).rows[0].name!=='fantasy_evolution')throw Error('Wrong database: no verification performed.');
 const tables={};
 const names=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 if(JSON.stringify(names)!==JSON.stringify(Object.keys(before.tables).sort()))throw Error('Public table inventory differs.');
 for(const name of names)tables[name]=(await db.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${quote(name)} t`)).rows[0];
 const runtime=new Set(['BackgroundJobRun','ProfessionalSyncState','ProviderRequestBudget','RateLimitBucket']);
 const differences=names.filter(name=>JSON.stringify(tables[name])!==JSON.stringify(before.tables[name])).map(table=>({table,before:before.tables[table],after:tables[table],expectedRuntime:runtime.has(table)}));
 if(differences.some(d=>!d.expectedRuntime))throw Error('Unexpected original-row fingerprint change: '+JSON.stringify(differences));
 const fks=(await db.query(`SELECT c.conname,c.conrelid::regclass::text child,c.confrelid::regclass::text parent,array_agg(a.attname::text ORDER BY k.ordinality) cols,array_agg(b.attname::text ORDER BY k.ordinality) refs FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(a,b,ordinality) ON true JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.a JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.b WHERE c.contype='f' AND n.nspname='public' GROUP BY c.oid`)).rows;
 for(const fk of fks){const nonnull=fk.cols.map(col=>`child.${quote(col)} IS NOT NULL`).join(' AND '),equal=fk.cols.map((col,i)=>`child.${quote(col)}=parent.${quote(fk.refs[i])}`).join(' AND ');if((await db.query(`SELECT count(*)::int n FROM ${fk.child} child WHERE ${nonnull} AND NOT EXISTS(SELECT 1 FROM ${fk.parent} parent WHERE ${equal})`)).rows[0].n)throw Error('Foreign key violation '+fk.conname);}
 const oldTriggers=JSON.parse(await readFile('data/operations/m5_closure_schema_baseline.json','utf8'));
 const triggers=(await db.query(`SELECT c.relname AS table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
 if(JSON.stringify(triggers)!==JSON.stringify(oldTriggers.triggers)||triggers.some(t=>t.tgenabled!=='O'))throw Error('Trigger definitions/enabling changed.');
 if(tables.ScoringRule.count!=='56'||tables._prisma_migrations.count!=='28')throw Error('Scoring/migration baseline differs.');
 const artifacts=[];
 for(const source of before.artifacts){if(await sha(source.path)!==source.sha256)throw Error('Immutable source changed '+source.path);artifacts.push({...source,preserved:true});}
 for(const screenshot of before.userScreenshots)if(await sha('reports/screenshots/'+screenshot.file)!==screenshot.sha256)throw Error('User screenshot changed.');
 await db.query('COMMIT');
 const result={version:'m61-development-preservation-1',readOnly:true,database:'fantasy_evolution',beforeCapturedAt:before.generatedAt,afterCapturedAt:new Date().toISOString(),tablesChecked:names.length,beforeTables:before.tables,afterTables:tables,expectedRuntimeDifferences:differences,unexpectedDifferences:[],foreignKeysChecked:fks.length,foreignKeyViolations:0,artifacts,userScreenshots:before.userScreenshots,allArtifactsAndScreenshotsPreserved:true,v9RuleCount:56,migrationCount:28,triggerAudit:{readOnly:true,triggers:triggers.length,definitionsUnchanged:true,allEnabled:true},newOperationalBackfills:0,newMigrations:0};
 await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({tables:names.length,foreignKeys:fks.length,triggers:triggers.length,sourceArtifacts:artifacts.length,unexpectedChanges:0}));
}finally{await db.end();}
