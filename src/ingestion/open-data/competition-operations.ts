import type {PrismaClient} from '@/generated/prisma/client';
const sports=['NFL','NBA','NHL'] as const;
type State={sport:string;cursor:string|null;nextPollAt:Date;leaseUntil:Date|null;failures:number;lastFailure:string|null;lastSuccessAt:Date|null};
type Receipt={sport:string;observedAt:Date;normalized:unknown;decisions:{decidedAt:Date}[]};
export function summarizeCompetitionOperations(input:{enabled:boolean;states:readonly State[];receipts:readonly Receipt[];at:Date}){
 const bySport=sports.map(sport=>{const state=input.states.find(row=>row.sport===sport),receipt=input.receipts.find(row=>row.sport===sport);let cursor:{processed?:number;replay?:number;held?:number}={};try{cursor=state?.cursor?JSON.parse(state.cursor):{};}catch{}
  const status=!input.enabled?'DISABLED':state?.lastFailure?'RETRYING':state?.leaseUntil&&state.leaseUntil>input.at?'PROCESSING':!state?.lastSuccessAt?'AWAITING_FIRST_CYCLE':cursor.processed?'SYNCHRONIZED':cursor.replay?'REPLAY_VERIFIED':'AWAITING_ELIGIBLE_PROSPECTIVE_SOURCE';
  return{sport,status,lastFailure:state?.lastFailure??null,failures:state?.failures??0,nextRetryAt:status==='RETRYING'?state!.nextPollAt:null,nextCycleAt:state?.nextPollAt??null,leaseUntil:state?.leaseUntil??null,lastProcessedAt:state?.lastSuccessAt??null,lastAcceptedAt:receipt?.decisions[0]?.decidedAt??null,lastAcceptedGameId:(receipt?.normalized as{gameId?:string}|undefined)?.gameId??null,lastCycleProcessed:cursor.processed??0,lastCycleReplay:cursor.replay??0,lastCycleHeld:cursor.held??0};
 });
 return{status:!input.enabled?'DISABLED':bySport.some(row=>row.status==='RETRYING')?'DEGRADED':'ACTIVE',retrying:bySport.filter(row=>row.status==='RETRYING').length,sports:bySport};
}
export async function readCompetitionOperations(db:PrismaClient,enabled:boolean,policyFingerprint:string,at=new Date()){
 if(!enabled)return summarizeCompetitionOperations({enabled:false,states:[],receipts:[],at});
 const[states,receipts]=await Promise.all([
  db.professionalSyncState.findMany({where:{provider:'internal-recurring-competition',stream:`PROSPECTIVE_FINAL_BOXES:${policyFingerprint}`}}),
  db.professionalDataObservation.findMany({where:{provider:'internal-recurring-competition',category:'RECURRING_COMPETITIVE_GAME',entityKey:{startsWith:`recurring-competitive-game:${policyFingerprint}:`},observedAt:{lte:at},decisions:{some:{outcome:'ACCEPTED',decidedAt:{lte:at}}}},include:{decisions:{where:{outcome:'ACCEPTED',decidedAt:{lte:at}},orderBy:{version:'desc'},take:1}},orderBy:[{sport:'asc'},{observedAt:'desc'},{id:'desc'}],distinct:['sport']}),
 ]);
 return summarizeCompetitionOperations({enabled,states,receipts,at});
}
