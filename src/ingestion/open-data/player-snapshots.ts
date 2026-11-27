import type { Sport } from '@/generated/prisma/enums';
import { fingerprint } from '@/ingestion/contracts';
import { playerSnapshotSchema, mapProfessionalSnapshotPosition, mapInjurySnapshot, type PlayerSnapshot } from '@/positions/player-snapshot-policy';
export type SnapshotReleaseProof={id:string;sport:Sport;sourceUrl:string;sha256:string;receivedAt:string;artifactModifiedAt:string|null;localPath?:string;proofKind?:string};
export type SnapshotReleaseRow=Record<string,string>;
/** Pure release normalization. The reviewed promoter remains a separate, explicit write boundary. */
export function playerSnapshotsFromRelease(input:{proof:SnapshotReleaseProof;rows:SnapshotReleaseRow[];at:string;policyAdoptedAt:string}){
 const {proof,rows,at,policyAdoptedAt}=input, seasonSuffix=Number(input.proof.id.match(/(\d{4})$/)?.[1]), seasonYear=seasonSuffix-(['NBA','NHL'].includes(input.proof.sport)?1:0), provider=proof.sport==='NFL'&&proof.id.includes('roster')?'nflverse-open-data':'sportsdataverse-open-data';
 const observations: {provider:string;sport:Sport;entityKey:string;revisionToken:string;revisionOrdinal:number;sourceReference:string;observedAt:string;effectiveAt:null;publishedAt:null;raw:Record<string,unknown>;normalized:PlayerSnapshot}[]=[],holds:{sourcePlayerId:string;reason:string;sourceRows:number[]}[]=[];
 const epoch=proof.artifactModifiedAt?Date.parse(proof.artifactModifiedAt):NaN;
 if(!Number.isSafeInteger(epoch)||epoch<0)return{observations,holds:[{sourcePlayerId:'RELEASE',reason:'SOURCE_ARTIFACT_REVISION_ORDER_UNKNOWN',sourceRows:[]}]};
 const floor=new Date(Math.max(Date.parse(proof.receivedAt),Date.parse(policyAdoptedAt))).toISOString();
 const expiry=(days:number)=>new Date(Date.parse(proof.receivedAt)+days*86400000).toISOString();
 const emit=(id:string,facet:PlayerSnapshot['facet'],sourceRows:number[],raw:Record<string,unknown>,date:string|null=null,precision:PlayerSnapshot['sourceDatePrecision']='OBSERVED',identityProvider='v9-historical',validUntil:string|null=expiry(7))=>{
  // UTC calendar cutoff is an explicit operational expiry, never a source event instant.
  if(proof.id.includes('injur')&&date){const dateWindowExpiry=new Date(Date.parse(date+'T00:00:00Z')+3*86400000).toISOString();validUntil=validUntil&&validUntil<dateWindowExpiry?validUntil:dateWindowExpiry;}
  if(proof.sport==='NHL'&&!proof.id.includes('injur')&&date){const dateWindowExpiry=new Date(Date.parse(date+'T00:00:00Z')+8*86400000).toISOString();validUntil=validUntil&&validUntil<dateWindowExpiry?validUntil:dateWindowExpiry;}
  if(validUntil&&Date.parse(validUntil)<=Math.max(Date.parse(floor),Date.parse(at))){holds.push({sourcePlayerId:id,reason:'SNAPSHOT_FRESHNESS_EXPIRED',sourceRows});return;}
  const normalized=playerSnapshotSchema.parse({kind:'PLAYER_SNAPSHOT',player:{provider:identityProvider,externalId:id},seasonStartYear:seasonYear,sourceRecordId:`${proof.id}:${id}:${sourceRows.join(',')}`,sourceFingerprint:proof.sha256,sourceSnapshotDate:date,sourceDatePrecision:precision,firstObservedAt:proof.receivedAt,policyAdoptedAt,validFrom:floor,validUntil,policyVersion:'approved-observed-player-snapshot-1',retracted:false,facet});
  observations.push({provider,sport:proof.sport,entityKey:`player-snapshot:${identityProvider}:${id}:${seasonYear}:${facet.type}${facet.type==='POSITION_AGGREGATE'?':'+facet.code:''}`,revisionToken:`${proof.sha256}:${sourceRows.join(',')}:${facet.type}`,revisionOrdinal:epoch,sourceReference:proof.sourceUrl,observedAt:at,effectiveAt:null,publishedAt:null,raw:{sourceProof:proof,sourceRows,...raw},normalized});
 };
 const groups=new Map<string,{row:SnapshotReleaseRow;line:number}[]>();
 for(const [i,row]of rows.entries()){
  const id=proof.id.includes('injur')?row.athlete_id:proof.sport==='NFL'?row.gsis_id:row.player_id;
  if(!id||proof.sport==='NFL'&&!proof.id.includes('injur')&&!/^00-\d{7}$/.test(id)){holds.push({sourcePlayerId:id||'MISSING',reason:'MISSING_EXPLICIT_SOURCE_PLAYER_ID',sourceRows:[i+2]});continue;}
  groups.set(id,[...(groups.get(id)??[]),{row,line:i+2}]);
 }
 if(proof.id.includes('injur')){
  const dates=rows.map(row=>row.as_of_date.slice(0,10)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort(),latest=dates.at(-1);
  if(!latest)return{observations,holds:[...holds,{sourcePlayerId:'RELEASE',reason:'INJURY_SNAPSHOT_DATE_UNKNOWN',sourceRows:[]}]};
  for(const [id,records]of groups){const current=records.filter(({row})=>row.as_of_date.slice(0,10)===latest);if(!current.length)continue;
   if(new Set(current.map(({row})=>fingerprint({status:row.status,type:row.type_name}))).size!==1){holds.push({sourcePlayerId:id,reason:'CONFLICTING_SAME_DATE_INJURY_DESIGNATIONS',sourceRows:current.map(r=>r.line)});continue;}
   const row=current[0].row,mapped=mapInjurySnapshot(proof.sport,row.status,row.type_name);if(mapped.conflict){holds.push({sourcePlayerId:id,reason:'CONFLICTING_TYPED_INJURY_STATUS',sourceRows:current.map(r=>r.line)});continue;}
   emit(id,{type:'AVAILABILITY',sourceStatus:row.status,sourceType:row.type_name,designation:mapped.designation,irEligible:mapped.irEligible},current.map(r=>r.line),{records:current.map(r=>r.row),injuryRecordTimestampSemantics:'UNVERIFIED_RECORD_OR_EDITORIAL_TIME',returnDateSemantics:'ESTIMATE_NOT_ACTIVATION'},latest,'DAY','espn',expiry(2));
  }
 }else for(const [id,records]of groups){
  if(proof.sport==='NBA'){
   const teams=new Set(records.map(record=>record.row.team_id));
   if(teams.size===1&&/^\d+$/.test([...teams][0])){const team=[...teams][0];emit(id,{type:'TEAM_ASSIGNMENT',team:{provider:'v9-historical',externalId:team},sourceTeamId:team,assignment:'ROSTERED'},records.map(record=>record.line),{records:records.map(record=>record.row)});}
   else holds.push({sourcePlayerId:id,reason:'CONFLICTING_OR_MISSING_EXPLICIT_NBA_TEAM_ID',sourceRows:records.map(record=>record.line)});
   continue;
  }
  let current=records;
  if(proof.sport==='NHL'){
   const latest=records.map(r=>r.row.game_date).sort().at(-1)!;current=records.filter(r=>r.row.game_date===latest);
   const cutoff=new Date(Date.parse(at)-7*86400000).toISOString().slice(0,10);
   if(latest<cutoff){holds.push({sourcePlayerId:id,reason:'DATED_GAME_ROSTER_OUTSIDE_REVIEWED_SEVEN_DAY_WINDOW',sourceRows:current.map(r=>r.line)});continue;}
  }
  const sourceRows=current.map(r=>r.line),raw={records:current.map(r=>r.row)};
  const positions=new Set(current.map(r=>r.row[proof.sport==='NFL'?'position':'position_code']));
  if(positions.size===1&&[...positions][0]){
   const sourcePosition=[...positions][0],mapped=mapProfessionalSnapshotPosition(proof.sport,sourcePosition);
   emit(id,{type:'POSITION',sourcePosition,...mapped,context:proof.sport==='NHL'?'DATED_GAME_ROSTER':'ROSTER_SNAPSHOT'},sourceRows,raw,proof.sport==='NHL'?current[0].row.game_date:null,proof.sport==='NHL'?'DAY':'OBSERVED');
  }else holds.push({sourcePlayerId:id,reason:'CONFLICTING_OR_MISSING_PROFESSIONAL_POSITION',sourceRows});
  const teams=new Set(current.map(r=>proof.sport==='NFL'?r.row.team:r.row.team_abbr));
  const statuses=new Set(current.map(r=>r.row.status));
  if(teams.size===1&&[...teams][0]&&(proof.sport==='NHL'||statuses.size===1&&['ACT','DEV','RES','INA','EXE'].includes([...statuses][0]))){
   const team=[...teams][0];emit(id,{type:'TEAM_ASSIGNMENT',team:{provider:'v9-historical',externalId:team},sourceTeamId:proof.sport==='NHL'?current[0].row.team_id:team,assignment:'ROSTERED'},sourceRows,raw,proof.sport==='NHL'?current[0].row.game_date:null,proof.sport==='NHL'?'DAY':'OBSERVED');
  }
  if(proof.sport==='NFL'){
   const years=new Set(current.map(r=>r.row.rookie_year));
   if(years.size===1&&/^\d{4}$/.test([...years][0])&&Number([...years][0])<=seasonYear)emit(id,{type:'ROOKIE',eligible:Number([...years][0])===seasonYear,sourceField:'rookie_year',sourceYear:Number([...years][0])},sourceRows,raw,null,'SEASON','v9-historical',null);
   if(statuses.size===1&&[...statuses][0]==='RET')emit(id,{type:'AVAILABILITY',sourceStatus:'RET',sourceType:'EXPLICIT_NFL_ROSTER_RETIREMENT',designation:'RETIRED',irEligible:false},sourceRows,raw,null,'OBSERVED','v9-historical',null);
  }
 }
 return{observations,holds};
}
