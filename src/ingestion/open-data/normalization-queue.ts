import { nbaPositionSnapshotSchema, NBA_POSITION_POLICY } from '@/positions/nba-policy';
import type { Observation } from '../contracts';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, link, rm } from 'node:fs/promises';
import { parquetReadObjects } from 'hyparquet';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { bodyHash, atomicFile } from './storage';
import type { ReleaseProduct } from './registry';
import { playerSnapshotsFromRelease } from './player-snapshots';
import { observedPolicyAdoptedAt } from '../evidence-policy';
import { fingerprint } from '../contracts';

/** Local normalized candidates only. Canonical promotion requires a separately
 * reviewed manifest; successful transport never grants write authority. */
export async function stageReleaseCandidates(product:ReleaseProduct,bytes:Uint8Array,metadata:Record<string,unknown>,root='data/provider_previews',at=new Date()){
 const sha256=bodyHash(bytes);if(metadata.sha256!==sha256)throw Error('Normalization source fingerprint mismatch.');
 const directory=`${root}/normalization-queue`,path=`${directory}/${product.id}-${sha256}-snapshot-v2.json`;
 await mkdir(directory,{recursive:true});
 let result:{sourceId:string;sourceSha256:string;firstValidatedAt:string;candidateCount:number;holdCount:number;targetFingerprint:string;canonicalPromotion:string};
 try{const prior=JSON.parse(await readFile(path,'utf8'));if(prior.sourceId!==product.id||prior.sourceSha256!==sha256||fingerprint(prior.candidates)!==prior.targetFingerprint)throw Error('Immutable normalized queue mismatch.');result=prior;}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  const snapshot=['ROSTER_SNAPSHOT','AVAILABILITY_SNAPSHOT'].includes(product.category);
  const rows:Record<string,string>[]=!snapshot?[]:product.filename.endsWith('.parquet')?(await parquetReadObjects({file:new Uint8Array(bytes).buffer,compressors:{GZIP:(body,size)=>gunzipSync(body,{maxOutputLength:Math.max(1,size)}),ZSTD:(body,size)=>zstdDecompressSync(body,{maxOutputLength:Math.max(1,size)})}})).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value==null?'':String(value)]))):parse(product.filename.endsWith('.gz')?gunzipSync(bytes,{maxOutputLength:128*1024*1024}):bytes,{columns:true,skip_empty_lines:true,bom:true});
  if(rows.length>1000000)throw Error('Normalization row bound exceeded.');
  const decoded=snapshot?playerSnapshotsFromRelease({proof:{id:product.id,sport:product.sport,sourceUrl:product.sourceUrl,sha256,receivedAt:String(metadata.receivedAt),artifactModifiedAt:typeof metadata.lastModified==='string'?metadata.lastModified:null},rows,at:at.toISOString(),policyAdoptedAt:observedPolicyAdoptedAt.toISOString()}):{observations:[],holds:[{sourcePlayerId:'RELEASE',reason:'CANONICAL_GAME_AND_STAT_BINDING_REQUIRES_REVIEWED_COMPETITIVE_PROCESSOR',sourceRows:[]}]};
  const candidates:Observation[]=decoded.observations.map(row=>({...row,raw:row.raw as Observation['raw']}));
  if(product.id==='nba-rosters-2027'){
   const ids=new Set<string>();
   for(const[index,row]of rows.entries()){
    if(!row.player_id||ids.has(row.player_id))throw Error('Direct NBA roster identity is missing or duplicated.');ids.add(row.player_id);
    if(Date.parse(String(metadata.receivedAt))+7*86400000<=+at){decoded.holds.push({sourcePlayerId:row.player_id,reason:'SNAPSHOT_FRESHNESS_EXPIRED',sourceRows:[index+2]});continue;}
    const normalized=nbaPositionSnapshotSchema.parse({kind:'NBA_POSITION_SNAPSHOT',player:{provider:'v9-historical',externalId:row.player_id},seasonStartYear:2026,sourcePosition:row.position??'',sourceRecordId:`${product.id}:line:${index+2}`,sourceFingerprint:sha256,sourceSnapshotDate:null,knownAt:String(metadata.receivedAt),validFrom:at.toISOString(),validUntil:new Date(Date.parse(String(metadata.receivedAt))+7*86400000).toISOString(),policyVersion:NBA_POSITION_POLICY,precision:'OBSERVED_SNAPSHOT',retracted:false});
    candidates.push({provider:'sportsdataverse-nba-roster',sport:'NBA',entityKey:`nba-position:v9-historical:${row.player_id}:2026`,revisionToken:`${sha256}:${index+2}:POSITION`,revisionOrdinal:Date.parse(String(metadata.receivedAt)),sourceReference:product.sourceUrl,observedAt:at.toISOString(),effectiveAt:null,publishedAt:null,raw:{sourceProduct:product.id,sourceFingerprint:sha256,sourceLine:index+2,sourceTeamId:row.team_id,firstTrustworthySourceObservation:metadata.receivedAt as string,revisionBasis:'LOCAL_ORDERED_OBSERVATION_NOT_OFFICIAL_SOURCE_PUBLICATION'},normalized});
   }
  }
  result={sourceId:product.id,sourceSha256:sha256,firstValidatedAt:at.toISOString(),candidateCount:candidates.length,holdCount:decoded.holds.length,targetFingerprint:fingerprint(candidates),canonicalPromotion:'DISABLED_REQUIRES_EXACT_REVIEW'};
  const temporary=`${path}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify({...result,candidates,holds:decoded.holds},null,2)+'\n',{flag:'wx'});
  try{await link(temporary,path);}catch(failure){if((failure as NodeJS.ErrnoException).code!=='EEXIST')throw failure;const prior=JSON.parse(await readFile(path,'utf8'));if(prior.sourceSha256!==sha256||fingerprint(prior.candidates)!==prior.targetFingerprint)throw Error('Concurrent normalized queue mismatch.');result=prior;}finally{await rm(temporary,{force:true});}
 }
 const summary={sourceId:result.sourceId,sourceSha256:sha256,firstValidatedAt:result.firstValidatedAt,candidateCount:result.candidateCount,holdCount:result.holdCount,targetFingerprint:result.targetFingerprint,canonicalPromotion:result.canonicalPromotion};
 await atomicFile(`${directory}/${product.id}.json`,JSON.stringify(summary,null,2)+'\n');return summary;
}
