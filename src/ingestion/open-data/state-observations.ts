import { gunzipSync } from 'node:zlib';
import { resolveMlbScheduleRows } from './mlb-schedule-result';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { atomicFile } from './storage';
import {nflCompletedScheduleResult} from './nfl-schedule-result';
import type {SourceRow} from './read';
export function releaseGameStates(sourceId:string,rows:SourceRow[],at:string){
 if(sourceId==='mlb-schedules-2026'){
  const groups=new Map<string,SourceRow[]>();for(const row of rows.filter(row=>row.season==='2026'))groups.set(row.game_pk,[...(groups.get(row.game_pk)??[]),row]);
  return [...groups].map(([gameId,records])=>{const result=resolveMlbScheduleRows(records,at);return{gameId,status:result.status==='PENDING_DATA'?'UNKNOWN':result.status};});
 }
 return sourceId==='nfl-results-2026'?rows.filter(row=>row.season==='2026').map(row=>({gameId:row.game_id,status:nflCompletedScheduleResult(row,at).status==='FINAL'?'FINAL':'UNKNOWN'})):rows.map(row=>({gameId:row.game_id,status:row.game_state}));
}
type ObservedState={status:string;firstObservedAt:string;lastObservedAt:string;sourceSha256:string};
/** Bounds refer to local observations of a potentially delayed file, never physical event instants. */
export function observedTransitions(previous:Record<string,ObservedState>,rows:{gameId:string;status:string}[],at:string,sourceSha256:string){
 const current:Record<string,ObservedState>={},transitions=[];
 for(const row of rows){if(current[row.gameId])throw Error('Duplicate game-state source identity.');const old=previous[row.gameId];
  if(old&&Date.parse(old.lastObservedAt)>Date.parse(at))throw Error('Local observation clock regressed.');
  if(!old||old.status!==row.status)transitions.push({gameId:row.gameId,from:old?.status??null,to:row.status,observedAfter:old?.lastObservedAt??null,observedBy:at,previousSourceSha256:old?.sourceSha256??null,sourceSha256,semantics:'LOCAL_OBSERVATION_INTERVAL',actualEventTimeProven:false});
  current[row.gameId]={status:row.status,firstObservedAt:old?.status===row.status?old.firstObservedAt:at,lastObservedAt:at,sourceSha256};
 }
 return{current,transitions};
}
export async function preserveGameStateObservations(sourceId:string,bytes:Uint8Array,at:string,sha256:string,root='data/provider_previews'){
 const directory=`${root}/state-observations`;await mkdir(directory,{recursive:true});
 let previous:Record<string,ObservedState>={};try{previous=JSON.parse(await readFile(`${directory}/${sourceId}.json`,'utf8')).current;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const rows=releaseGameStates(sourceId,parse(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes,{maxOutputLength:128*1024*1024}):bytes,{columns:true,skip_empty_lines:true}) as SourceRow[],at);
 const result=observedTransitions(previous,rows,at,sha256);
 if(result.transitions.length){const receipt=`${directory}/${sourceId}-${sha256}.json`;try{await writeFile(receipt,JSON.stringify({observedAt:at,...result},null,2)+'\n',{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
 await atomicFile(`${directory}/${sourceId}.json`,JSON.stringify(result,null,2)+'\n');
 return{observedGames:rows.length,observedTransitions:result.transitions.length,actualStartInstants:0,actualCompletionInstants:0,semantics:'LOCAL_OBSERVATION_INTERVALS_ONLY'};
}
