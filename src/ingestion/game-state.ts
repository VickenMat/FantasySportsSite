import{promoteObservedGameState}from'./observed-game-state';
import{resolveProfessionalGame}from"./professional-identities";
import type{Prisma}from"@/generated/prisma/client";
import type{Observation}from"./contracts";
import{promoteLifecycle}from"./lifecycle";
type GameState=Observation&{normalized:Extract<Observation["normalized"],{kind:"GAME_STATE"}>};
export async function promoteGameState(tx:Prisma.TransactionClient,input:GameState,observationId:string){
 const n=input.normalized;
 if('evidencePolicy' in n&&n.evidencePolicy==='CONSERVATIVE_OBSERVED_V1')return promoteObservedGameState(tx,input,observationId);
 const pending=(reason:string)=>({outcome:"PENDING_DATA" as const,reason,targets:{}});
 const reject=(reason:string)=>({outcome:"QUARANTINED" as const,reason,targets:{}});
 if(!input.publishedAt||!input.effectiveAt)return pending("Game state requires explicit publication and effective instants; polling time supplies neither.");
 const knownAt=new Date(input.publishedAt),effectiveAt=new Date(input.effectiveAt);
 if(knownAt<effectiveAt)return reject("Game state cannot be known before its effective instant.");
 if(n.actualStartsAt&&new Date(n.actualStartsAt)>knownAt)return reject("Actual start cannot be later than source publication.");
 if(n.completedAt&&(n.status!=="FINAL"||new Date(n.completedAt)>knownAt||(n.actualStartsAt&&new Date(n.completedAt)<new Date(n.actualStartsAt))))return reject("Completion evidence conflicts with game state, actual start or source publication.");
 if(n.actualStartsAt&&["SCHEDULED","POSTPONED"].includes(n.status))return reject("An unstarted game state cannot claim an actual start.");
 const game=await resolveProfessionalGame(tx,input.sport,n.game);
 if(!game)return pending("Game-state evidence requires an explicit canonical game identifier.");
 if(input.entityKey!==`game-state:${game.id}`)return reject("Use the stable canonical game-state stream key.");
 if(!game.startsAt&&n.scheduledStartsAt)await tx.game.update({where:{id:game.id},data:{startsAt:new Date(n.scheduledStartsAt)}});
 let completionEvidenceId:string|null=null,completionPending=false;
 if(n.completedAt){
  const completion=await promoteLifecycle(tx,{...input,normalized:{kind:"GAME_COMPLETION",game:n.game,completedAt:n.completedAt}},observationId);
  if(completion.outcome==="ACCEPTED")completionEvidenceId="evidenceId" in completion.targets?completion.targets.evidenceId??null:null;
  else completionPending=true;
 }
 return{outcome:"ACCEPTED" as const,reason:"Revisioned game state preserves scheduled, actual and completion instants separately; source disagreement and cross-period attribution remain explicit.",targets:{gameId:game.id,completionEvidenceId,completionPending,competitiveAttributionChanged:false}};
}
