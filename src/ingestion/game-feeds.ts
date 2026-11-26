import type{GameStatRole}from"@/generated/prisma/enums";
import type{ProviderAdapter,ProviderPolicy}from"./contracts";
import{fingerprint}from"./contracts";
import{synchronizeProvider}from"./sync";
import{selectAndScoreSource,type SourceSelectionPolicy}from"./source-selection";
import{getDatabase}from"@/lib/db";
import{retryPendingProfessionalObservations}from"./pending-retry";
export type GameFeedRegistration={policy:ProviderPolicy&{gameId:string};adapter:ProviderAdapter;scoringPolicy?:SourceSelectionPolicy;verifiedRoles?:ReadonlyMap<string,GameStatRole>};
/** No approved live-game product is configured. Adding an adapter never grants data rights. */
export const approvedGameFeeds:readonly GameFeedRegistration[]=[];
/** Once per provider/professional game, independently of fantasy leagues and users. */
export async function processProfessionalGameFeeds(registrations:readonly GameFeedRegistration[]=approvedGameFeeds,clock:()=>Date=()=>new Date()){
 if(registrations.length>500)throw new Error("Process professional game feeds in bounded batches.");
 const unique=new Map<string,GameFeedRegistration>();
 for(const registration of registrations){
  if(registration.policy.permission!=="DISABLED"&&!registration.policy.requestWindows?.length)throw new Error("Game feeds require an explicit provider-wide rolling request policy.");
  const key=`${registration.policy.provider}:${registration.policy.sport}:${registration.policy.gameId}:${registration.policy.stream}`;
  const prior=unique.get(key);
  if(prior&&(prior.adapter!==registration.adapter||fingerprint(prior.policy)!==fingerprint(registration.policy)||fingerprint(prior.scoringPolicy??null)!==fingerprint(registration.scoringPolicy??null)||fingerprint([...(prior.verifiedRoles??[])].sort())!==fingerprint([...(registration.verifiedRoles??[])].sort())))throw new Error("Conflicting registrations for one professional game require configuration review.");
  unique.set(key,registration);
 }
 if(!unique.size)return{status:"PENDING_PERMISSION" as const,processed:0,outcomes:[]};
 const providers=[...new Set([...unique.values()].filter(r=>r.policy.permission==="FIXTURE_ONLY").map(r=>r.policy.provider))];
 if(providers.length)await retryPendingProfessionalObservations({permission:"FIXTURE_ONLY",providers},clock());
 const queue=[...unique.values()],outcomes=[];
 // Bound parallel sockets/work independently from the number of fantasy franchises.
 for(let offset=0;offset<queue.length;offset+=4){
  const results=await Promise.allSettled(queue.slice(offset,offset+4).map(async registration=>{
   const sync=await synchronizeProvider(registration.adapter,registration.policy,clock);
   const scores=[];
   if(sync.status!=="PENDING_PERMISSION"&&registration.scoringPolicy){
    // Recover scoring even after a crash between cursor commit and ledger projection,
    // including a restart whose next page is empty or whose request is waiting/backing off.
    const players=await getDatabase().playerGameStat.findMany({where:{gameId:registration.policy.gameId,provider:{in:registration.scoringPolicy.sources.filter(p=>p.permission==="FIXTURE_ONLY").map(p=>p.provider)}},distinct:["playerId"],take:1001,select:{playerId:true}});
    if(players.length>1000)throw new Error("Professional game player projection exceeds its bounded scope.");
    for(const {playerId} of players){
     const key=`${registration.policy.gameId}:${playerId}`;
     scores.push(await selectAndScoreSource({sport:registration.policy.sport,gameId:registration.policy.gameId,playerId,role:registration.verifiedRoles?.get(key)},registration.scoringPolicy,clock()));
    }
   }
   return{provider:registration.policy.provider,gameId:registration.policy.gameId,syncStatus:sync.status,scores};
  }));
  for(const result of results)outcomes.push(result.status==="fulfilled"?result.value:{syncStatus:"FAILED",reason:"Game processing failed; persisted staging and cursor remain available for replay."});
 }
 return{status:"PROCESSED" as const,processed:outcomes.length,outcomes};
}
