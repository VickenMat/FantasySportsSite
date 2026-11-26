import{z}from'zod';
import type{Prisma}from'@/generated/prisma/client';
import{getDatabase}from'@/lib/db';
import{fingerprint}from'@/ingestion/contracts';
import{lockSport}from'./sport-lock';
const rowSchema=z.object({priorStatId:z.uuid(),priorContentHash:z.string().length(64),playerId:z.uuid(),gameId:z.uuid(),role:z.enum(['SKATER','GOALIE']),fields:z.partialRecord(z.enum(['faceoff_wins','shorthanded_points_bonus','goalie_win']),z.number().int().min(0).max(1000000)),evidence:z.record(z.string(),z.json())}).strict();
export type HistoricalStatEnrichmentRow=z.infer<typeof rowSchema>;
const schema=z.object({version:z.literal('real-nhl-missing-fields-1'),sourceProofs:z.array(z.json()).min(1),rows:z.array(rowSchema).min(1).max(20000)}).strict();
/** Appends unknown-field revisions only; never rewrites publication, eligibility, ledgers or outcomes. */
export async function reconcileHistoricalStatistics(raw:unknown,approval?:{expectedFingerprint:string}){
 const manifest=schema.parse(raw),targetFingerprint=fingerprint(manifest);
 if(approval&&approval.expectedFingerprint!==targetFingerprint)throw Error('Historical enrichment manifest changed since review.');
 return getDatabase().$transaction(async tx=>{
  if(approval)await lockSport(tx,'NHL');else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const ids=manifest.rows.map(r=>r.priorStatId);if(new Set(ids).size!==ids.length)throw Error('Duplicate historical target.');
  const originals=await tx.playerGameStat.findMany({where:{id:{in:ids},game:{sport:'NHL'},player:{sport:'NHL'}}});const originalMap=new Map(originals.map(r=>[r.id,r]));
  const latest=await tx.playerGameStat.findMany({where:{provider:'v9-historical',playerId:{in:[...new Set(manifest.rows.map(r=>r.playerId))]},gameId:{in:[...new Set(manifest.rows.map(r=>r.gameId))]}},orderBy:{revision:'desc'},distinct:['gameId','playerId','role']});
  const latestMap=new Map(latest.map(r=>[`${r.gameId}:${r.playerId}:${r.role}`,r]));
  const changes=[];let alreadyApplied=0;
  for(const target of manifest.rows){const prior=originalMap.get(target.priorStatId);if(!prior||prior.contentHash!==target.priorContentHash||prior.gameId!==target.gameId||prior.playerId!==target.playerId||prior.role!==target.role||prior.provider!=='v9-historical')throw Error('Exact historical target no longer matches.');
   const current=latestMap.get(`${target.gameId}:${target.playerId}:${target.role}`);if(current?.id!==prior.id){if((current?.raw as {historicalStatEnrichment?:{targetFingerprint:string}})?.historicalStatEnrichment?.targetFingerprint===targetFingerprint){alreadyApplied++;continue;}throw Error('A newer historical revision requires a fresh review.');}
   if(!Object.keys(target.fields).length)throw Error('Empty historical repair.');
   for(const [key,value]of Object.entries(target.fields)){if((prior.normalized as Record<string,unknown>)[key]!=null)throw Error('Known statistics cannot be overwritten by missing-field enrichment.');if(key==='goalie_win'&&(prior.role!=='GOALIE'||value>1))throw Error('Goalie decisions need explicit binary evidence.');if(key!=='goalie_win'&&prior.role!=='SKATER')throw Error('Skater evidence cannot repair goalie statistics.');if(!target.evidence[key])throw Error('Every field requires traceable evidence.');}
   changes.push({target,prior});
  }
  const report={fingerprint:targetFingerprint,changes:changes.length,players:new Set(changes.map(r=>r.prior.playerId)).size,alreadyApplied,applied:Boolean(approval),officialPublicationChanges:0,eligibilityChanges:0,scoreLedgerChanges:0};
  if(!approval||!changes.length)return report;
  const batch=await tx.importBatch.upsert({where:{sport_provider_contentHash_importerVersion:{sport:'NHL',provider:'sportsdataverse-historical-enrichment',contentHash:targetFingerprint,importerVersion:manifest.version}},update:{},create:{sport:'NHL',provider:'sportsdataverse-historical-enrichment',contentHash:targetFingerprint,importerVersion:manifest.version,sourceName:'Reviewed CC-BY-4.0 exact NHL missing-field evidence',summary:report}});
  const revisions:Prisma.PlayerGameStatCreateManyInput[]=changes.map(({target,prior})=>{const source={original:prior.raw,historicalStatEnrichment:{targetFingerprint,fields:target.fields,evidence:target.evidence}} as Prisma.InputJsonValue;return{gameId:prior.gameId,playerId:prior.playerId,teamId:prior.teamId,provider:prior.provider,role:prior.role,importBatchId:batch.id,revision:prior.revision+1,priorRevisionId:prior.id,contentHash:fingerprint(source),sourceLine:prior.sourceLine,observedPositions:prior.observedPositions,normalized:{...(prior.normalized as Prisma.InputJsonObject),...target.fields},raw:source,sourceKnownAt:prior.sourceKnownAt};});
  for(let i=0;i<revisions.length;i+=250)await tx.playerGameStat.createMany({data:revisions.slice(i,i+250)});
  return report;
 },{isolationLevel:'Serializable',timeout:120000});
}
