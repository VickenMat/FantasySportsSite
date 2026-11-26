import 'dotenv/config';
import pg from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
const [operation,path]=process.argv.slice(2);
if(!['--capture','--compare'].includes(operation)||!path)throw new Error('Use --capture or --compare with a private report path.');
const url=new URL(process.env.DATABASE_URL);
if(url.pathname!=='/fantasy_evolution')throw new Error('Expected preserved development database.');
const client=new pg.Client({connectionString:url.href});
const q=s=>'"'+s.replaceAll('"','""')+'"';
await client.connect();
try {
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const output=[];
 for(const {tablename} of tables) {
  const row=(await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${q(tablename)} t`)).rows[0];
  output.push({table:tablename,...row});
 }
 await client.query('COMMIT');
 if(operation==='--capture') {await writeFile(path,JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify({capturedTables:output.length,path}));}
 else {
  const before=JSON.parse(await readFile(path,'utf8'));
  const differences=output.filter(row=>JSON.stringify(row)!==JSON.stringify(before.find(old=>old.table===row.table)));
  const missing=before.filter(old=>!output.some(row=>row.table===old.table));
  console.log(JSON.stringify({tables:output.length,differences,missing}));
  if(missing.length||differences.some(row=>row.table!=='BackgroundJobRun'))process.exitCode=1;
 }
} finally {await client.end();}
