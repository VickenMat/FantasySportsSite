import{resolveProfessionalGame,resolveProfessionalTeam}from"./professional-identities";
import type{Prisma}from"@/generated/prisma/client";
import{applicableRules,calculateScore,sportByRole}from"@/scoring/engine";
import{ubpV9Rules}from"@/scoring/ubp-v9";
import{contentFingerprint,type Observation}from"./contracts";
export const statEntityKey=(gameId:string,playerId:string,role:string)=>`stat:${gameId}:${playerId}:${role}`;
type StatObservation=Observation&{normalized:Extract<Observation["normalized"],{kind:"STAT"}>};
/** Materialize only explicitly mapped incremental rows. Ledger selection is a separate reviewed step. */
export async function promoteStatistics(tx:Prisma.TransactionClient,input:StatObservation,observationId:string){
 const n=input.normalized;
 const pending=(reason:string)=>({outcome:"PENDING_DATA" as const,reason,targets:{}});
 const reject=(reason:string)=>({outcome:"QUARANTINED" as const,reason,targets:{}});
 if(sportByRole[n.role]!==input.sport)return reject("The statistical role belongs to another sport.");
 const applicable=applicableRules(ubpV9Rules,n.role),keys=new Set(applicable.map(r=>r.statKey==="pitching_innings"?"pitching_outs":r.statKey==="tight_end_reception_bonus"?"receptions":r.statKey));
 if(Object.keys(n.stats).some(key=>!keys.has(key)))return reject("Normalized statistics contain a field outside the existing V9 role schema.");
 try{calculateScore(ubpV9Rules,{role:n.role,stats:n.stats});}catch{return reject("Invalid statistical count; original evidence is retained without materialization.");}
 if(n.role==="GOALIE"&&[n.stats.goalie_win,n.stats.shutout].some(v=>v!=null&&v>1))return reject("Goalie decisions and shutouts require explicit binary evidence.");
 if(n.publicationSemantics==="OFFICIAL_BOX_SCORE"&&!input.publishedAt)return pending("Official box-score publication semantics require an explicit publication instant.");
 if(n.initialPublishedAt&&(n.publicationSemantics!=="OFFICIAL_BOX_SCORE"||n.phase==="LIVE"||!input.publishedAt||new Date(n.initialPublishedAt)>new Date(input.publishedAt)))return reject("Initial final-box publication requires verified original-publication evidence no later than the current publication.");
 const player=await tx.playerExternalId.findUnique({where:{sport_provider_externalId:{sport:input.sport,...n.player}}});
 const game=await resolveProfessionalGame(tx,input.sport,n.game);
 const team=await resolveProfessionalTeam(tx,input.sport,n.team);
 if(!player||!game||!team)return pending("Statistics require explicit canonical player, game and professional-team mappings.");
 if(input.entityKey!==statEntityKey(game.id,player.playerId,n.role))return reject("Use the stable canonical athlete/game/role statistical stream key.");
 if(!await tx.gameTeam.findUnique({where:{gameId_teamId:{gameId:game.id,teamId:team.id}}}))return reject("The professional team is not a verified participant in this canonical game.");
 const previous=await tx.playerGameStat.findFirst({where:{gameId:game.id,playerId:player.playerId,provider:input.provider,role:n.role},orderBy:{revision:"desc"}});
 const priorInitial=(previous?.raw as {professionalObservation?:{initialPublishedAt?:string|null}}|null)?.professionalObservation?.initialPublishedAt??null;
 if(priorInitial&&n.initialPublishedAt&&+new Date(priorInitial)!==+new Date(n.initialPublishedAt))return reject("Changing an established original publication instant requires reviewed correction evidence; the competitive clock is not restarted.");
 const initialPublishedAt=n.initialPublishedAt??priorInitial;
 if(initialPublishedAt&&input.publishedAt&&new Date(initialPublishedAt)>new Date(input.publishedAt))return reject("Original publication cannot follow the current source publication.");
 const contentHash=contentFingerprint(input);
 const batch=await tx.importBatch.upsert({where:{sport_provider_contentHash_importerVersion:{sport:input.sport,provider:input.provider,contentHash,importerVersion:"professional-stat-1"}},update:{},create:{sport:input.sport,provider:input.provider,contentHash,importerVersion:"professional-stat-1",sourceName:input.sourceReference,summary:{observationId,scope:"incremental canonical box score"}}});
 const stat=await tx.playerGameStat.create({data:{gameId:game.id,playerId:player.playerId,teamId:team.id,provider:input.provider,role:n.role,importBatchId:batch.id,revision:(previous?.revision??0)+1,priorRevisionId:previous?.id??null,contentHash,sourceLine:1,observedPositions:[],normalized:n.stats,raw:{professionalObservation:{observationId,sourceReference:input.sourceReference,phase:n.phase,publicationSemantics:n.publicationSemantics,initialPublishedAt},original:input.raw},sourceKnownAt:n.publicationSemantics==="OFFICIAL_BOX_SCORE"?new Date(input.publishedAt!):null}});
 return{outcome:"ACCEPTED" as const,reason:"Incremental statistics appended using existing V9 fields; unknown values remain null and source selection is separate.",targets:{playerId:player.playerId,gameId:game.id,statId:stat.id,role:n.role,officialPublicationKnown:stat.sourceKnownAt!==null}};
}
