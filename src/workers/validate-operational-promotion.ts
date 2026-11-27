import 'dotenv/config';
import { readFile,writeFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { fingerprint } from '@/ingestion/contracts';
import { reconcileOperationalPromotionInTransaction,validateOperationalPromotionSources } from '@/server/operational-data-promotion';
import type { ReviewedCompetitiveStages } from '@/ingestion/open-data/apply-competitive-stages';
import { snapshotPositionEligibility } from '@/positions/player-snapshot-policy';
import { projectNbaPositions } from '@/positions/nba-policy';
assertIsolatedIngestionDatabase();
const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,db=getDatabase(),client=new pg.Client({connectionString:process.env.DATABASE_URL});
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
type Snapshot={count:string;fingerprint:string};
const batch=await validateOperationalPromotionSources(JSON.parse(await readFile('data/operational_enrichment/reviewed_manifest.json','utf8'))),approved=fingerprint(batch),at=new Date();
const stages=batch.competitive as unknown as ReviewedCompetitiveStages|undefined;
await client.connect();
try{
 await client.query(`SET search_path TO ${q(schema)}`);
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map((row:{tablename:string})=>row.tablename);
 if(tables.length!==89)throw Error('Expected the populated 89-application-table baseline.');
 const appendable=new Set(['ProfessionalDataObservation','ProfessionalDataDecision','PlayerAvailabilityEvidence','RookieEligibilityEvidence','Season','GameCompletionEvidence','ImportBatch','PlayerGameStat','ScoreLedger','ScoreLedgerEntry']);
 for(const table of appendable){await client.query(`CREATE TEMP TABLE ${q('operational_before_'+table)} AS SELECT id FROM ${q(table)}`);await client.query(`CREATE UNIQUE INDEX ON ${q('operational_before_'+table)}(id)`);await client.query(`ANALYZE ${q('operational_before_'+table)}`);}
 const snapshot=async(table:string,originalOnly=false):Promise<Snapshot>=>(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${q(table)} t ${originalOnly&&appendable.has(table)?`WHERE EXISTS(SELECT 1 FROM ${q('operational_before_'+table)} baseline WHERE baseline.id=t.id)`:''}`)).rows[0];
 const capture=async()=>{const result=new Map<string,Snapshot>();for(const table of tables)result.set(table,await snapshot(table));return result;};
 const unchanged=async(expected:Map<string,Snapshot>,originalOnly=false)=>{for(const table of tables)if(JSON.stringify(await snapshot(table,originalOnly))!==JSON.stringify(expected.get(table)))throw Error(`Preserved original data changed: ${table}.`);};
 const before=await capture();
 const run=(raw:unknown,apply=false)=>db.$transaction(async tx=>{if(!apply)await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileOperationalPromotionInTransaction(tx,raw,apply?{expectedFingerprint:fingerprint(raw)}:undefined,at);},{isolationLevel:'Serializable',timeout:600000});
 const dryRun=await run(batch);
 if(dryRun.changes!==14465||dryRun.availabilityAppends!==805||dryRun.rookieAppends!==3075||dryRun.alreadyApplied)throw Error('Frozen operational target scope changed.');
 // A two-row real-source subset proves late semantic rejection rolls back earlier accepted raw/decision rows.
 const positionRows=batch.generic.observations.filter(row=>row.normalized.kind==='PLAYER_SNAPSHOT'&&row.normalized.facet.type==='POSITION').slice(0,2),invalid=structuredClone(positionRows[1]);
 if(invalid.normalized.kind!=='PLAYER_SNAPSHOT'||invalid.normalized.facet.type!=='POSITION')throw Error('Expected a position fixture subset.');
 invalid.normalized.facet.fantasyPositions=['INVALID'];
 const targetKeys=new Set(positionRows.map(row=>`${row.sport}:${row.provider}:${row.entityKey}`));
 const emptyNba={...batch.nba.manifest,targets:[]};
 const bad={version:batch.version,generic:{...batch.generic,observations:[positionRows[0],invalid],canonicalGuards:batch.generic.canonicalGuards.filter(row=>targetKeys.has(`${row.sport}:${row.provider}:${row.entityKey}`))},nba:{manifest:emptyNba,report:{...batch.nba.report,targetFingerprint:fingerprint(emptyNba)}},calendar:{...batch.calendar,observations:[]}};
 let rollback=false;try{await run(bad,true);}catch(error){if(!(error instanceof Error)||!error.message.includes('position mapping differs')&&!error.message.includes('position mapping')&&!error.message.includes('Professional/fantasy position'))throw error;rollback=true;}
 if(!rollback)throw Error('Late semantic rejection failed.');
 for(const table of ['ProfessionalDataObservation','ProfessionalDataDecision'])if(JSON.stringify(await snapshot(table))!==JSON.stringify(before.get(table)))throw Error('Late rejection left partial evidence.');
 const applied=await run(batch,true);
 if(applied.changes!==dryRun.changes||applied.availabilityAppends!==805||applied.rookieAppends!==3075)throw Error('Applied target differs from the exact dry run.');
 await unchanged(before,true);
 const competitive=applied.competitive;
 const expected:Record<string,number>={ProfessionalDataObservation:applied.observationAppends+(competitive&&!competitive.alreadyApplied?competitive.sourceObservations+2*competitive.completeBoxes+1:0),ProfessionalDataDecision:applied.decisionAppends+(competitive&&!competitive.alreadyApplied?competitive.sourceObservations+2*competitive.completeBoxes+1:0),PlayerAvailabilityEvidence:805,RookieEligibilityEvidence:3075,Season:applied.seasonAppends,GameCompletionEvidence:stages?.stages.length??0,ImportBatch:competitive?.newStatistics??0,PlayerGameStat:competitive?.newStatistics??0,ScoreLedger:stages?.expectedLedgerHeads.filter(row=>!row.ledgerId).length??0,ScoreLedgerEntry:competitive?.newScoreEntries??0};
 const appendCounts:Record<string,number>={};for(const table of tables){appendCounts[table]=Number((await snapshot(table)).count)-Number(before.get(table)!.count);if(appendCounts[table]!== (expected[table]??0))throw Error(`Unexpected canonical append scope: ${table} actual=${appendCounts[table]} expected=${expected[table]??0}.`);}
 const boxProofCounts=(await client.query(`SELECT observation.category,count(*)::int AS n FROM "ProfessionalDataObservation" observation WHERE NOT EXISTS(SELECT 1 FROM "operational_before_ProfessionalDataObservation" baseline WHERE baseline.id=observation.id) AND observation.category IN('COMPLETE_FINAL_BOX','BOX_CLOCK') GROUP BY observation.category`)).rows as {category:string;n:number}[];
 if(stages&&((boxProofCounts.find(row=>row.category==='COMPLETE_FINAL_BOX')?.n??0)!==3||(boxProofCounts.find(row=>row.category==='BOX_CLOCK')?.n??0)!==3||competitive?.completeBoxes!==3))throw Error('Expected three explicit complete-box observations and three independent persistent clock anchors.');
 const unknownSourceClocks=(await client.query(`SELECT count(*)::int AS n FROM "ProfessionalDataObservation" observation WHERE NOT EXISTS(SELECT 1 FROM "operational_before_ProfessionalDataObservation" baseline WHERE baseline.id=observation.id) AND observation.category IN('PLAYER_SNAPSHOT','NBA_POSITION_SNAPSHOT','SEASON_DATE_SNAPSHOT') AND observation."effectiveAt" IS NULL AND observation."publishedAt" IS NULL`)).rows[0].n;
 if(unknownSourceClocks!==14465)throw Error('Snapshot promotion fabricated exact source clocks.');
 const rows=await db.professionalDataObservation.findMany({where:{category:{in:['PLAYER_SNAPSHOT','NBA_POSITION_SNAPSHOT']}},include:{decisions:{orderBy:{version:'desc'},take:1}}}),coverage:Record<string,{known:number;eligible:number}>={};
 const grouped=new Map<string,{sport:typeof rows[number]['sport'];playerId:string;seasonYear:number;rows:typeof rows}>();
 for(const row of rows){const target=row.decisions[0]?.targets as {playerId?:string}|undefined,n=row.normalized as {seasonStartYear?:number};if(row.decisions[0]?.outcome!=='ACCEPTED'||!target?.playerId||!n.seasonStartYear)continue;const key=`${row.sport}:${target.playerId}:${n.seasonStartYear}`,group=grouped.get(key)??{sport:row.sport,playerId:target.playerId,seasonYear:n.seasonStartYear,rows:[]};group.rows.push(row);grouped.set(key,group);}
 for(const group of grouped.values()){const projection=group.sport==='NBA'?projectNbaPositions({playerId:group.playerId,seasonYear:group.seasonYear,asOf:at,observations:group.rows,legacy:[]}):snapshotPositionEligibility({playerId:group.playerId,sport:group.sport,seasonYear:group.seasonYear,asOf:at,observations:group.rows});const key=`${group.sport}:${group.seasonYear}`,value=coverage[key]??{known:0,eligible:0};if(projection.available)value.known++;if(projection.positions.length)value.eligible++;coverage[key]=value;}
 for(const [key,eligible]of Object.entries({'NFL:2026':961,'NHL:2026':691,'NBA:2026':528,'MLB:2026':1081,'MLB:2027':944}))if(coverage[key]?.eligible!==eligible)throw Error(`Unexpected accepted eligibility coverage: ${key}.`);
 const after=await capture(),repeatedDry=await run(batch),replayed=await run(batch,true);
 if(repeatedDry.changes||replayed.changes||repeatedDry.competitive?.newStatistics||replayed.competitive?.newStatistics||repeatedDry.competitive?.newScoreEntries||replayed.competitive?.newScoreEntries)throw Error('Operational replay proposed or added changes.');
 await unchanged(after);await unchanged(before,true);
 const report={fingerprint:approved,targetDatabase:'fantasy_evolution_test',schema,developmentWrites:0,originalTablesPreserved:tables.length,originalRowsUnchanged:true,lateSemanticAtomicRollback:rollback,dryRun,applied,appendCounts,replayChanges:0,repeatedDry,replayed,exactSourceClocksRemainUnknown:unknownSourceClocks,completeBoxObservationCount:boxProofCounts.find(row=>row.category==='COMPLETE_FINAL_BOX')?.n??0,persistentBoxClockCount:boxProofCounts.find(row=>row.category==='BOX_CLOCK')?.n??0,currentEligibilityCoverage:coverage,originalSourceStatsPreserved:true,ownershipAndFinancialHistoryPreserved:true,finalizedCompetitionUnchanged:true,sourceProofsVerified:true};
 await writeFile('data/operational_enrichment/populated_copy_validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({fingerprint:approved,appendCounts:Object.fromEntries(Object.entries(appendCounts).filter(([,value])=>value)),coverage,replayChanges:0,originalTablesPreserved:tables.length,competitive:applied.competitive},null,2));
}finally{await client.end();await db.$disconnect();}
