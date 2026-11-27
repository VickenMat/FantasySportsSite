/** Optional read-only UUID coverage snapshot; never imports historical archives. */
import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {getDatabase} from '@/lib/db';
import {fingerprint} from '@/ingestion/contracts';
import {identityResolutionSchema,professionalPlayerIdentityState} from '@/ingestion/identity-resolutions';
const url=new URL(process.env.DATABASE_URL!);if(url.pathname!=='/fantasy_evolution'||!['localhost','127.0.0.1'].includes(url.hostname)||url.searchParams.has('schema'))throw Error('Read-only coverage export requires the preserved local development database.');
const db=getDatabase();try{
 const asOf=new Date(),snapshot=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const aliases=await tx.playerExternalId.findMany({where:{provider:'v9-historical',player:{isSynthetic:false,isDemo:false}},select:{sport:true,externalId:true,playerId:true},orderBy:[{sport:'asc'},{externalId:'asc'}]});
  const observations=await tx.professionalDataObservation.findMany({where:{provider:'internal-identity-review',category:'IDENTITY_RESOLUTION',observedAt:{lte:asOf},effectiveAt:{lte:asOf}},select:{raw:true}});
  const refs=new Map<string,ReturnType<typeof identityResolutionSchema.parse>>();for(const row of observations){const parsed=identityResolutionSchema.safeParse((row.raw as {proposal?:unknown}).proposal);if(parsed.success&&parsed.data.reference.provider==='v9-historical')refs.set(`${parsed.data.sport}:${parsed.data.reference.externalId}`,parsed.data);}
  const rows=new Map(aliases.map(row=>[`${row.sport}:${row.externalId}`,{...row,status:'RESOLVED',source:'LEGACY_ANCHOR'}]));
  for(const [key,proposal]of refs){const state=await professionalPlayerIdentityState(tx,proposal.sport,proposal.reference,asOf);const real=state.mapping?await tx.player.findFirst({where:{id:state.mapping.playerId,isSynthetic:false,isDemo:false},select:{id:true}}):null;if(state.status!=='RESOLVED'||!real)rows.delete(key);else rows.set(key,{sport:proposal.sport,externalId:proposal.reference.externalId,playerId:real.id,status:'RESOLVED',source:'REVIEWED_OVERLAY'});}
  const games=await tx.gameScheduleObservation.findMany({where:{scheduleProvider:'schedule-v5',importBatch:{status:'COMPLETE',importerVersion:'schedule-v5-1'}},select:{sport:true,scheduleExternalId:true,gameId:true,id:true,contentHash:true},orderBy:[{sport:'asc'},{scheduleExternalId:'asc'},{id:'asc'}]});
  return{games,rows:[...rows.values()].sort((a,b)=>`${a.sport}:${a.externalId}`.localeCompare(`${b.sport}:${b.externalId}`)),legacyAliasRows:aliases.length,reviewedReferencesChecked:refs.size};
 },{isolationLevel:'RepeatableRead',timeout:120000});
 const body={version:'m6-readonly-operational-identity-coverage-1',snapshotAsOf:asOf.toISOString(),database:'fantasy_evolution',provider:'v9-historical',...snapshot,developmentWrites:0};const manifest={...body,fingerprint:fingerprint(snapshot.rows),gameSnapshotFingerprint:fingerprint(snapshot.games)};
 await mkdir('data/simulation/identity_crosswalks',{recursive:true});await writeFile('data/simulation/identity_crosswalks/operational_uuid_snapshot.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({rows:snapshot.rows.length,acceptedV5GameObservationRows:snapshot.games.length,legacyAliasRows:snapshot.legacyAliasRows,reviewedReferencesChecked:snapshot.reviewedReferencesChecked,fingerprint:manifest.fingerprint,developmentWrites:0},null,2));
}finally{await db.$disconnect();}
