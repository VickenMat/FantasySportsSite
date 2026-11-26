import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { fingerprint } from '@/ingestion/contracts';
import { recalculateInTransaction } from './score-ledger';
const target=z.object({gameId:z.uuid(),playerId:z.uuid(),role:z.enum(['HITTER','PITCHER']).nullable(),source:z.object({sha256:z.string().length(64)}).passthrough(),statTargets:z.array(z.object({id:z.uuid(),contentHash:z.string().length(64),role:z.enum(['HITTER','PITCHER'])})).length(2)}).passthrough();
const manifestSchema=z.object({report:z.object({targetFingerprint:z.string().length(64)}).passthrough(),rows:z.array(target).max(1000)});
/** Role choices are reviewed independently of realized points; only new historical ledgers are added. */
export async function materializeHistoricalRolesInTransaction(tx:Prisma.TransactionClient,raw:unknown,approval?:{expectedFingerprint:string}){
 const manifest=manifestSchema.parse(raw),reviewed=fingerprint(manifest.rows);
 if(reviewed!==manifest.report.targetFingerprint||approval&&reviewed!==approval.expectedFingerprint)throw Error('Historical role manifest changed.');
 const rows=manifest.rows.filter(row=>row.role),selected=new Set<string>();let changes=0,alreadyApplied=0;
 for(const row of rows){
  const key=`${row.playerId}:${row.gameId}`;if(selected.has(key))throw Error('Duplicate role target.');selected.add(key);
  for(const target of row.statTargets){const current=await tx.playerGameStat.findFirst({where:{provider:'v9-historical',gameId:row.gameId,playerId:row.playerId,role:target.role,game:{sport:'MLB'}},orderBy:{revision:'desc'}});if(!current||current.id!==target.id||current.contentHash!==target.contentHash)throw Error('Exact reviewed MLB statistical target changed.');}
  const ledger=await tx.scoreLedger.findFirst({where:{gameId:row.gameId,playerId:row.playerId,preset:{version:'ubp-v9-experimental'}},include:{entries:{orderBy:{sequence:'desc'},take:1}}});
  if(ledger){if(ledger.role!==row.role||!ledger.entries[0]?.reason.includes(reviewed))throw Error('Existing target ledger requires separate review.');alreadyApplied++;continue;}
  changes++;
  if(approval){const result=await recalculateInTransaction(tx,'MLB',{gameId:row.gameId,playerId:row.playerId,role:row.role!,sourceProvider:'v9-historical',reason:`Reviewed complete-game role evidence; source ${row.source.sha256}; manifest ${reviewed}`});if(!result.changed||result.entry.missingStats.length)throw Error('Reviewed MLB role did not produce one complete V9 score.');}
 }
 return{fingerprint:reviewed,changes,players:new Set(rows.map(row=>row.playerId)).size,alreadyApplied,applied:Boolean(approval)};
}
