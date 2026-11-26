import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { lockSport } from './sport-lock';
import { reconcileHistoricalStatisticsInTransaction } from './historical-stat-enrichment';
import { materializeHistoricalRolesInTransaction } from './historical-role-materialization';
import { reconcileReviewedRosterInTransaction } from './reviewed-roster-discovery';
import { reconcileReviewedNflRosterInTransaction } from './reviewed-nfl-roster';
import { reviewedNflRosterDiscoverySchema } from './reviewed-nfl-roster';
import { reconcileReviewedNflStatisticsInTransaction } from './reviewed-nfl-statistics';
const schema=z.object({version:z.literal('m5-accelerated-reviewed-batch-1'),nhl:z.json(),mlb:z.object({report:z.json(),rows:z.array(z.json())}),nba:z.json(),nfl:z.json(),nflStatistics:z.json()}).strict();
export async function reconcileAcceleratedBatchInTransaction(tx:Prisma.TransactionClient,raw:unknown,approval?:{expectedFingerprint:string}){
 const batch=schema.parse(raw),reviewed=fingerprint(batch);
 if(approval&&reviewed!==approval.expectedFingerprint)throw Error('Consolidated data batch changed since review.');
 if(approval)for(const sport of ['NFL','MLB','NBA','NHL'] as const)await lockSport(tx,sport);
 const nhl=await reconcileHistoricalStatisticsInTransaction(tx,batch.nhl,approval?{expectedFingerprint:fingerprint(batch.nhl)}:undefined);
 const mlb=await materializeHistoricalRolesInTransaction(tx,batch.mlb,approval?{expectedFingerprint:fingerprint(batch.mlb.rows)}:undefined);
 const nba=await reconcileReviewedRosterInTransaction(tx,batch.nba,approval?{expectedFingerprint:fingerprint(batch.nba)}:undefined);
 const nfl=await reconcileReviewedNflRosterInTransaction(tx,batch.nfl,approval?{expectedFingerprint:fingerprint(batch.nfl)}:undefined);
 const dependencies=new Map(reviewedNflRosterDiscoverySchema.parse(batch.nfl).candidates.map(row=>[row.sourcePlayerId,row.proposedPlayerId]));
 const nflStatistics=await reconcileReviewedNflStatisticsInTransaction(tx,batch.nflStatistics,approval?{expectedFingerprint:fingerprint(batch.nflStatistics)}:undefined,dependencies);
 return{fingerprint:reviewed,applied:Boolean(approval),nhl,mlb,nba,nfl,nflStatistics};
}
export async function reconcileAcceleratedBatch(raw:unknown,approval?:{expectedFingerprint:string}){
 return getDatabase().$transaction(async tx=>{if(!approval)await tx.$executeRaw`SET TRANSACTION READ ONLY`;return reconcileAcceleratedBatchInTransaction(tx,raw,approval);},{isolationLevel:'Serializable',timeout:180000});
}
