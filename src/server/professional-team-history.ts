import{getDatabase}from"@/lib/db";
import type{Sport}from"@/generated/prisma/enums";
import{observationSchema}from"@/ingestion/contracts";
/** Read immutable claims, resolve corrections within a source, and expose cross-source conflicts explicitly. */
export async function professionalTeamHistory(input:{playerId:string;sport:Sport;asOf:Date},client:Pick<ReturnType<typeof getDatabase>,"professionalDataObservation"|"proTeam">=getDatabase()){
 const observations=await client.professionalDataObservation.findMany({where:{sport:input.sport,category:"TEAM_ASSIGNMENT",publishedAt:{lte:input.asOf},effectiveAt:{lte:input.asOf},decisions:{some:{outcome:"ACCEPTED",targets:{path:["playerId"],equals:input.playerId}}}},include:{decisions:{where:{outcome:"ACCEPTED"},orderBy:{version:"desc"},take:1}},orderBy:[{revisionOrdinal:"desc"},{publishedAt:"desc"},{id:"asc"}]});
 const latestEntities=new Set<string>();
 const history=observations.flatMap(row=>{
  const key=`${row.provider}:${row.entityKey}`,superseded=latestEntities.has(key);latestEntities.add(key);
  const parsed=observationSchema.shape.normalized.safeParse(row.normalized);
  if(!parsed.success||parsed.data.kind!=="TEAM_ASSIGNMENT")return[];
  const targets=row.decisions[0]?.targets as {teamId?:string|null;seasonId?:string};
  return[{observationId:row.id,provider:row.provider,sourceReference:row.sourceReference,teamId:targets.teamId??null,seasonId:targets.seasonId??null,assignment:parsed.data.assignment,superseded,effectiveAt:row.effectiveAt!,publishedAt:row.publishedAt!}];
 }).sort((a,b)=>+b.effectiveAt-+a.effectiveAt||+b.publishedAt-+a.publishedAt);
 const teamIds=[...new Set(history.flatMap(r=>r.teamId?[r.teamId]:[]))];
 const teams=teamIds.length?await client.proTeam.findMany({where:{id:{in:teamIds},sport:input.sport},select:{id:true,code:true,displayName:true}}):[];
 const withTeams=history.map(row=>({...row,team:teams.find(team=>team.id===row.teamId)??null}));
 const sourceClaims=new Map<string,typeof withTeams[number]>();for(const row of withTeams)if(!row.superseded&&!sourceClaims.has(row.provider))sourceClaims.set(row.provider,row);
 const distinct=new Set([...sourceClaims.values()].map(row=>row.teamId??"FREE_AGENT"));
 const missingTeam=[...sourceClaims.values()].some(row=>row.teamId&&!row.team);
 const status=distinct.size>1?"CONFLICT":missingTeam?"PENDING_DATA":distinct.size?"SOURCE_RECORDED":"UNKNOWN";
 return{status,current:status==="SOURCE_RECORDED"?[...sourceClaims.values()][0]:null,history:withTeams,sourceClaims:[...sourceClaims.values()],fantasyOwnershipChanged:false};
}
