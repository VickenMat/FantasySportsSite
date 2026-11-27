import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { sourceProduct } from '@/ingestion/open-data/read';
import { stageReleaseCandidates } from '@/ingestion/open-data/normalization-queue';
import { releaseRegistry } from '@/ingestion/open-data/registry';
import { releaseKey } from '@/ingestion/open-data/scheduler';

/** Existing immutable local sources only: zero network requests, zero canonical writes. */
const db=getDatabase(),outcomes=[];
try{
 for(const product of releaseRegistry.filter(row=>row.enabled)){
  const source=await sourceProduct(product.id),result=await stageReleaseCandidates(product,await readFile(source.path),source.metadata);
  const cursorRecorded=await db.$transaction(async tx=>{
   const key=releaseKey(product),state=await tx.professionalSyncState.findUnique({where:{provider_sport_stream:key}});if(!state)return false;
   await tx.$queryRaw`SELECT id FROM "ProfessionalSyncState" WHERE id=${state.id}::uuid FOR UPDATE`;
   const current=await tx.professionalSyncState.findUniqueOrThrow({where:{id:state.id}}),cursor=JSON.parse(current.cursor??'{}');
   if(cursor.sha256!==result.sourceSha256||current.leaseUntil&&current.leaseUntil>new Date())return false;
   await tx.professionalSyncState.update({where:{id:state.id},data:{cursor:JSON.stringify({...cursor,normalizedQueue:result})}});return true;
  });
  outcomes.push({...result,cursorRecorded});
 }
 console.log(JSON.stringify({networkRequests:0,canonicalWrites:0,outcomes},null,2));
}finally{await db.$disconnect();}
