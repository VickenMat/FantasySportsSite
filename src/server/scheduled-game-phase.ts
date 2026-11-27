import type { Prisma } from '@/generated/prisma/client';
import type { GamePhase } from '@/generated/prisma/enums';
type PhaseObservation={sport:string;scheduleProvider:string;scheduleExternalId:string;phase:GamePhase;retrievedAt:Date;sourceRecord:unknown;importBatch:{status:string;importerVersion:string}};
/** Latest accepted V5 stream facts fill a missing canonical phase; they never rewrite it. */
export function isVerifiedRegularGame(game:{sport:string;phase:GamePhase;scheduleObservations:readonly PhaseObservation[]}){
 if(game.phase!=='UNKNOWN'&&game.phase!=='REGULAR')return false;
 const streams=new Map<string,PhaseObservation[]>();
 for(const row of game.scheduleObservations){if(row.sport!==game.sport||row.scheduleProvider!=='schedule-v5'||row.importBatch.status!=='COMPLETE'||row.importBatch.importerVersion!=='schedule-v5-1')continue;
  const key=`${row.scheduleProvider}:${row.scheduleExternalId}`,old=streams.get(key);
  if(!old||row.retrievedAt>old[0].retrievedAt)streams.set(key,[row]);else if(+row.retrievedAt===+old[0].retrievedAt)old.push(row);
 }
 const phases=new Set<GamePhase>();
 for(const latest of streams.values())for(const row of latest){const source=row.sourceRecord&&typeof row.sourceRecord==='object'?row.sourceRecord as Record<string,unknown>:null,kind=String(source?.game_type??'').toLowerCase();const recorded=({regular:'REGULAR',postseason:'POSTSEASON',playoff:'POSTSEASON',preseason:'PRESEASON'} as Record<string,GamePhase>)[kind];
  if(recorded&&recorded!==row.phase)return false;
  if(row.phase!=='UNKNOWN')phases.add(row.phase);
 }
 if(phases.size>1||[...phases].some(phase=>phase!=='REGULAR'))return false;
 return game.phase==='REGULAR'||phases.has('REGULAR');
}
export async function verifiedRegularSeasonGames(tx:Pick<Prisma.TransactionClient,'game'>,seasonId:string){
 const games=await tx.game.findMany({where:{seasonId,phase:{in:['REGULAR','UNKNOWN']},startsAt:{not:null}},include:{scheduleObservations:{where:{scheduleProvider:'schedule-v5',importBatch:{status:'COMPLETE',importerVersion:'schedule-v5-1'}},include:{importBatch:{select:{status:true,importerVersion:true}}}}},orderBy:{startsAt:'asc'}});
 return games.filter(isVerifiedRegularGame);
}
