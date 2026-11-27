import { getDatabase } from '@/lib/db';
import type { Sport } from '@/generated/prisma/enums';
import { observationSchema } from '@/ingestion/contracts';
import { snapshotStreamHeads, playerSnapshotSchema } from '@/positions/player-snapshot-policy';
type Claim={observationId:string;provider:string;sourceReference:string;teamId:string|null;seasonId:string|null;assignment:'ROSTERED'|'FREE_AGENT'|'UNKNOWN';superseded:boolean;effectiveAt:Date|null;publishedAt:Date|null;operationalEffectiveAt:Date;knownAt:Date;sourceSnapshotDate:string|null;sourcePrecision:string;retracted:boolean;conflicted:boolean};
/** Exact and prospectively observed team claims remain distinct; no fantasy ownership mutation. */
export async function professionalTeamHistory(input:{playerId:string;sport:Sport;asOf:Date},client:Pick<ReturnType<typeof getDatabase>,'professionalDataObservation'|'proTeam'>=getDatabase()){
 const observations=await client.professionalDataObservation.findMany({where:{sport:input.sport,OR:[{category:'TEAM_ASSIGNMENT',publishedAt:{lte:input.asOf},effectiveAt:{lte:input.asOf}},{category:'PLAYER_SNAPSHOT',observedAt:{lte:input.asOf}}],decisions:{some:{targets:{path:['playerId'],equals:input.playerId}}}},include:{decisions:{orderBy:{version:'desc'}}},orderBy:[{revisionOrdinal:'desc'},{publishedAt:'desc'},{id:'asc'}]});
 const snapshotHeads=snapshotStreamHeads(observations,input.asOf);
 const latestEntities=new Set<string>(),history:Claim[]=[];
 for(const row of observations){
  const parsed=observationSchema.shape.normalized.safeParse(row.normalized),snapshot=playerSnapshotSchema.safeParse(row.normalized);
  // Exact source claims retain the established publication-clock as-of semantics.
  // Newly observed snapshots additionally require an actual accepted local decision.
  const decision=snapshot.success?row.decisions.find(value=>value.decidedAt<=input.asOf):row.decisions[0];if(decision?.outcome!=='ACCEPTED'&&!(snapshot.success&&decision?.outcome==='QUARANTINED'&&(decision.targets as{snapshotConflict?:boolean}).snapshotConflict))continue;
  const targets=decision.targets as {playerId?:string;teamId?:string|null;seasonId?:string;operationalEffectiveAt?:string};if(targets.playerId!==input.playerId)continue;
  let claim:Omit<Claim,'superseded'>;
  if(snapshot.success){const n=snapshot.data;if(n.facet.type!=='TEAM_ASSIGNMENT'||!targets.operationalEffectiveAt||new Date(targets.operationalEffectiveAt)>input.asOf||new Date(n.validFrom)>input.asOf)continue;
   const expired=Boolean(n.validUntil&&new Date(n.validUntil)<=input.asOf),head=snapshotHeads.get(`${row.provider}:${row.entityKey}`),conflicted=Boolean(head?.conflict&&head.row.id===row.id&&!expired);
   claim={observationId:row.id,provider:row.provider,sourceReference:row.sourceReference,teamId:n.retracted||expired||conflicted?null:targets.teamId??null,seasonId:targets.seasonId??null,assignment:n.retracted||expired||conflicted?'UNKNOWN':'ROSTERED',effectiveAt:null,publishedAt:null,operationalEffectiveAt:new Date(targets.operationalEffectiveAt),knownAt:decision.decidedAt,sourceSnapshotDate:n.sourceSnapshotDate,sourcePrecision:n.sourceDatePrecision,retracted:n.retracted||expired,conflicted};
  }else if(parsed.success&&parsed.data.kind==='TEAM_ASSIGNMENT'&&row.effectiveAt&&row.publishedAt){claim={observationId:row.id,provider:row.provider,sourceReference:row.sourceReference,teamId:targets.teamId??null,seasonId:targets.seasonId??null,assignment:parsed.data.assignment,effectiveAt:row.effectiveAt,publishedAt:row.publishedAt,operationalEffectiveAt:row.effectiveAt,knownAt:row.publishedAt,sourceSnapshotDate:null,sourcePrecision:'EXACT',retracted:false,conflicted:false};}
  else continue;
  const key=`${row.provider}:${row.entityKey}`,superseded=snapshot.success?snapshotHeads.get(key)?.row.id!==row.id:latestEntities.has(key);latestEntities.add(key);history.push({...claim,superseded});
 }
 history.sort((a,b)=>+b.operationalEffectiveAt-+a.operationalEffectiveAt||+b.knownAt-+a.knownAt);
 const teamIds=[...new Set(history.flatMap(row=>row.teamId?[row.teamId]:[]))],teams=teamIds.length?await client.proTeam.findMany({where:{id:{in:teamIds},sport:input.sport},select:{id:true,code:true,displayName:true}}):[];
 const withTeams=history.map(row=>({...row,team:teams.find(team=>team.id===row.teamId)??null}));
 const sourceClaims=new Map<string,typeof withTeams[number]>();for(const row of withTeams)if(!row.superseded&&!sourceClaims.has(row.provider))sourceClaims.set(row.provider,row);
 const distinct=new Set([...sourceClaims.values()].filter(row=>row.assignment!=='UNKNOWN').map(row=>row.teamId??'FREE_AGENT'));
 const unknown=[...sourceClaims.values()].some(row=>row.assignment==='UNKNOWN'),missingTeam=[...sourceClaims.values()].some(row=>row.teamId&&!row.team);
 const status=[...sourceClaims.values()].some(row=>row.conflicted)||distinct.size>1?'CONFLICT':missingTeam?'PENDING_DATA':unknown?'UNKNOWN':distinct.size?'SOURCE_RECORDED':'UNKNOWN';
 return{status,current:status==='SOURCE_RECORDED'?[...sourceClaims.values()][0]:null,history:withTeams,sourceClaims:[...sourceClaims.values()],fantasyOwnershipChanged:false};
}
