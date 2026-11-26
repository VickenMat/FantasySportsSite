import type{Prisma}from"@/generated/prisma/client";
import type{Sport}from"@/generated/prisma/enums";
import type{Observation}from"./contracts";
type Tx=Prisma.TransactionClient;
type Reference={provider:string;externalId:string};
async function bridgeTarget(tx:Tx,sport:Sport,ref:Reference,kind:"TEAM_IDENTITY"|"GAME_IDENTITY"){
 const observation=await tx.professionalDataObservation.findFirst({where:{sport,provider:ref.provider,category:kind,entityKey:`${kind==="TEAM_IDENTITY"?"team":"game"}:${ref.externalId}`,decisions:{some:{outcome:"ACCEPTED"}}},include:{decisions:{where:{outcome:"ACCEPTED"},orderBy:{version:"desc"},take:1}},orderBy:{revisionOrdinal:"desc"}});
 return observation?.decisions[0]?.targets as {teamId?:string;gameId?:string}|undefined;
}
export async function resolveProfessionalTeam(tx:Tx,sport:Sport,ref:Reference){
 const direct=await tx.proTeam.findUnique({where:{sport_provider_externalId:{sport,...ref}}});if(direct)return direct;
 const target=await bridgeTarget(tx,sport,ref,"TEAM_IDENTITY");return target?.teamId?tx.proTeam.findFirst({where:{id:target.teamId,sport}}):null;
}
export async function resolveProfessionalGame(tx:Tx,sport:Sport,ref:Reference){
 const direct=await tx.game.findUnique({where:{sport_provider_externalId:{sport,...ref}}});if(direct)return direct;
 const target=await bridgeTarget(tx,sport,ref,"GAME_IDENTITY");return target?.gameId?tx.game.findFirst({where:{id:target.gameId,sport}}):null;
}
type Identity=Observation&{normalized:Extract<Observation["normalized"],{kind:"TEAM_IDENTITY"|"GAME_IDENTITY"}>};
export async function promoteProfessionalIdentity(tx:Tx,input:Identity){
 const n=input.normalized;
 const pending=(reason:string)=>({outcome:"PENDING_DATA" as const,reason,targets:{}});
 const reject=(reason:string)=>({outcome:"QUARANTINED" as const,reason,targets:{}});
 const refs=[{provider:input.provider,externalId:n.externalId},...n.links];
 if(input.entityKey!==`${n.kind==="TEAM_IDENTITY"?"team":"game"}:${n.externalId}`)return reject("Use the source's stable professional identity stream key.");
 if(n.kind==="TEAM_IDENTITY"){
  const candidates=[];for(const ref of refs){const team=await resolveProfessionalTeam(tx,input.sport,ref);if(team)candidates.push(team);}
  const ids=[...new Set(candidates.map(team=>team.id))];if(ids.length>1)return reject("Explicit professional-team links disagree; names cannot resolve the conflict.");
  if(ids.length)return{outcome:"ACCEPTED" as const,reason:"Professional-team bridge preserves its canonical ID and name.",targets:{teamId:ids[0]}};
  if(n.discovery!=="NEW"||n.links.length)return pending("A canonical professional-team bridge is required; unknown linked IDs are not invented.");
  if(await tx.proTeam.findFirst({where:{sport:input.sport,OR:[{displayName:{equals:n.displayName,mode:"insensitive"}},...(n.code?[{code:n.code}]:[])]}}))return reject("Professional-team name/code collision requires explicit identity review.");
  const team=await tx.proTeam.create({data:{sport:input.sport,provider:input.provider,externalId:n.externalId,displayName:n.displayName,code:n.code}});
  return{outcome:"ACCEPTED" as const,reason:"Explicit new professional team recorded without merging names.",targets:{teamId:team.id}};
 }
 const candidates=[];for(const ref of refs){const game=await resolveProfessionalGame(tx,input.sport,ref);if(game)candidates.push(game);}
 const ids=[...new Set(candidates.map(game=>game.id))];if(ids.length>1)return reject("Explicit professional-game links disagree; do not force a historical crosswalk.");
 const season=await tx.season.findUnique({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}}});
 if(!season)return pending("An existing explicit professional season is required for game discovery.");
 const participants:{teamId:string;side:"HOME"|"AWAY"|"UNKNOWN"}[]=[];for(const row of n.teams){const team=await resolveProfessionalTeam(tx,input.sport,row.team);if(!team)return pending("Game participants require canonical professional-team bridges.");participants.push({teamId:team.id,side:row.side});}
 if(new Set(participants.map(team=>team.teamId)).size!==participants.length)return reject("A professional game cannot contain the same canonical team twice.");
 if(ids.length){
  const game=candidates.find(row=>row.id===ids[0])!;
  if(game.seasonId!==season.id||(game.phase!=="UNKNOWN"&&n.phase!=="UNKNOWN"&&game.phase!==n.phase))return reject("The game identity conflicts with its canonical season or phase.");
  const known=await tx.gameTeam.findMany({where:{gameId:game.id}});
  if(participants.length&&known.some(row=>!participants.some(team=>team.teamId===row.teamId)))return reject("Changing canonical game participants requires reviewed source correction evidence.");
  for(const team of participants)await tx.gameTeam.upsert({where:{gameId_teamId:{gameId:game.id,teamId:team.teamId}},create:{gameId:game.id,...team},update:{}});
  const fill={...(game.startsAt===null&&n.scheduledStartsAt&&input.publishedAt?{startsAt:new Date(n.scheduledStartsAt)}:{}),...(game.gameDate===null&&n.gameDate?{gameDate:new Date(`${n.gameDate}T00:00:00Z`)}:{}),...(game.phase==="UNKNOWN"&&n.phase!=="UNKNOWN"&&input.publishedAt?{phase:n.phase}:{})};
  if(Object.keys(fill).length)await tx.game.update({where:{id:game.id},data:fill});
  return{outcome:"ACCEPTED" as const,reason:"Professional-game bridge preserves canonical identity, original dates and cycle attribution.",targets:{gameId:game.id}};
 }
 if(n.discovery!=="NEW"||n.links.length)return pending("An explicit canonical game bridge is required; unmatched historical crosswalks remain unresolved.");
 if(participants.length!==2)return pending("New game discovery requires both explicit professional participants.");
 if(n.scheduledStartsAt&&!input.publishedAt)return pending("A new scheduled start requires explicit source publication; date-only records do not become kickoff times.");
 // Reject a second canonical game for the same explicit teams/start rather than merging by similarity.
 if(n.scheduledStartsAt&&await tx.game.findFirst({where:{sport:input.sport,seasonId:season.id,startsAt:new Date(n.scheduledStartsAt),AND:participants.map(team=>({teams:{some:{teamId:team.teamId}}}))}}))return reject("A matching professional fixture already exists; provide its explicit identity bridge.");
 const game=await tx.game.create({data:{sport:input.sport,seasonId:season.id,provider:input.provider,externalId:n.externalId,phase:n.phase,gameDate:n.gameDate?new Date(`${n.gameDate}T00:00:00Z`):null,startsAt:n.scheduledStartsAt?new Date(n.scheduledStartsAt):null,teams:{create:participants}}});
 return{outcome:"ACCEPTED" as const,reason:"Explicit new professional game recorded; missing kickoff times remain null.",targets:{gameId:game.id}};
}
