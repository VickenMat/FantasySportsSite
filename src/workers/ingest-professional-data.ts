import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { decodeLocalPage, LocalPageAdapter } from "@/ingestion/adapters";
import { fingerprint } from "@/ingestion/contracts";
import { synchronizeProvider } from "@/ingestion/sync";
import { getDatabase } from "@/lib/db";

async function main() {
 const [path,operation]=process.argv.slice(2);
 if(!path||operation&&!['--dry-run','--apply-fixture'].includes(operation))throw new Error('Use data:ingest -- page.json [--dry-run|--apply-fixture]. Default is dry-run.');
 if((await stat(path)).size>2_000_000)throw new Error('Page exceeds the two-megabyte limit.');
 const page=decodeLocalPage(JSON.parse(await readFile(path,'utf8')));
 const scopes=[...new Set(page.records.map(row=>`${row.provider}:${row.sport}:${row.normalized.kind}`))];
 if(scopes.length!==1)throw new Error('Each local page requires exactly one provider/sport/stream.');
 const report={mode:operation==='--apply-fixture'?'ISOLATED_FIXTURE':'DRY_RUN',fingerprint:fingerprint(page),records:page.records.length,scope:scopes[0],publicationMissing:page.records.filter(row=>!row.publishedAt).length,developmentWrites:false};
 console.info(JSON.stringify(report));
 if(operation!=='--apply-fixture')return;
 const first=page.records[0];
 try {
  console.info(JSON.stringify(await synchronizeProvider(new LocalPageAdapter(page),{provider:first.provider,sport:first.sport,stream:first.normalized.kind,minIntervalMs:60000,maxRequests:100,leaseMs:30000,permission:'FIXTURE_ONLY'})));
 } finally {await getDatabase().$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Ingestion failed.');process.exitCode=1;});
