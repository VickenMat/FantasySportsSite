import{z}from"zod";
import type{GameStatRole,Sport}from"@/generated/prisma/enums";
import{getDatabase}from"@/lib/db";
import{lockSport}from"@/server/sport-lock";
import{recalculateInTransaction}from"@/server/score-ledger";
import{ubpV9}from"@/scoring/ubp-v9";
import{chooseRole,sportByRole}from"@/scoring/engine";
import{statEntityKey}from"./statistics";
import{enrichSelectedStatistics}from"./stat-enrichment";
import{professionalGameProjection}from"@/server/professional-game-state";
import{getEligiblePositions}from"@/server/positions";
import{assertFixtureDatabase}from"./persist";
import{fingerprint,observationSchema}from"./contracts";
const policySchema=z.object({version:z.string().trim().min(1).max(100),enrichment:z.enum(["NONE","MISSING_ONLY"]).default("NONE"),sources:z.array(z.object({provider:z.string().min(1).max(100),priority:z.number().int().min(0).max(1000),maxAgeMs:z.number().int().min(1000).max(31536000000),fields:z.array(z.string().min(1).max(64)).max(200).optional(),allowProvisional:z.boolean(),permission:z.enum(["FIXTURE_ONLY","DISABLED"])}).strict()).max(20)}).strict().refine(v=>new Set(v.sources.map(s=>s.provider)).size===v.sources.length,"Source policies must have unique providers.").refine(v=>v.enrichment==="MISSING_ONLY"||v.sources.every(s=>!s.fields),"Per-field source scopes require explicit missing-field enrichment mode.");
export type SourceSelectionPolicy=z.input<typeof policySchema>;
/** Disabled without an explicit reviewed policy. This slice promotes only disposable fixtures. */
export async function selectAndScoreSource(input:{sport:Sport;gameId:string;playerId:string;role?:GameStatRole},rawPolicy:SourceSelectionPolicy,at=new Date()){
 const policy=policySchema.parse(rawPolicy),sources=policy.sources.filter(p=>p.permission==="FIXTURE_ONLY");
 if(!sources.length)return{status:"PENDING_POLICY" as const};
 assertFixtureDatabase();const db=getDatabase();
 return db.$transaction(async tx=>{
  await lockSport(tx,input.sport);
  const selectionKey={provider:"internal-source-selection",sport:input.sport,stream:`game:${input.gameId}:player:${input.playerId}`};
  const recordSelection=async(status:string)=>{
   const failed=!["SCORED","UNCHANGED"].includes(status);
   const data={cursor:JSON.stringify({status,policyVersion:policy.version,policyFingerprint:fingerprint(policy)}),nextPollAt:at,lastFailure:failed?status:null,...(failed?{}:{lastSuccessAt:at})};
   await tx.professionalSyncState.upsert({where:{provider_sport_stream:selectionKey},create:{...selectionKey,...data},update:data});
  };
  const checks=await tx.professionalSyncState.findMany({where:{provider:{in:sources.map(p=>p.provider)},sport:input.sport,stream:{in:[`STAT:game:${input.gameId}`,`GAME_BUNDLE:game:${input.gameId}`]}},select:{provider:true,lastSuccessAt:true}});
  const observations=await tx.professionalDataObservation.findMany({where:{sport:input.sport,category:"STAT",entityKey:{in:(Object.keys(sportByRole) as GameStatRole[]).filter(role=>sportByRole[role]===input.sport).map(role=>statEntityKey(input.gameId,input.playerId,role))},provider:{in:sources.map(p=>p.provider)},observedAt:{lte:at},decisions:{some:{outcome:"ACCEPTED",AND:[{targets:{path:["gameId"],equals:input.gameId}},{targets:{path:["playerId"],equals:input.playerId}}]}}},include:{decisions:{where:{outcome:"ACCEPTED"},orderBy:{version:"desc"},take:1}},orderBy:[{revisionOrdinal:"desc"},{observedAt:"desc"}]});
  const seen=new Set<string>();
  const candidates=observations.flatMap(row=>{
   const parsed=observationSchema.shape.normalized.safeParse(row.normalized);if(!parsed.success||parsed.data.kind!=="STAT")return[];
   const key=`${row.provider}:${parsed.data.role}`;if(seen.has(key))return[];seen.add(key);
   const source=sources.find(s=>s.provider===row.provider)!;
   const verifiedAt=Math.max(+row.observedAt,...checks.filter(c=>c.provider===row.provider&&c.lastSuccessAt&&c.lastSuccessAt<=at).map(c=>+c.lastSuccessAt!));
   if(+at-verifiedAt>source.maxAgeMs||(!source.allowProvisional&&(parsed.data.phase==="LIVE"||parsed.data.publicationSemantics!=="OFFICIAL_BOX_SCORE"||!row.publishedAt)))return[];
   const targets=row.decisions[0]?.targets as {statId?:string};if(!targets.statId)return[];
   return[{provider:row.provider,role:parsed.data.role,priority:source.priority,observationId:row.id,statId:targets.statId,observedAt:row.observedAt}];
  });
  const ledger=await tx.scoreLedger.findFirst({where:{gameId:input.gameId,playerId:input.playerId,preset:{version:ubpV9.version}},select:{role:true}});
  if(ledger&&input.role&&ledger.role!==input.role)return{status:"ROLE_CONFLICT" as const};
  if(input.sport==="MLB"&&!ledger&&!input.role&&candidates.length){await recordSelection("PENDING_ROLE");return{status:"PENDING_ROLE" as const};}
  let role:GameStatRole;try{role=chooseRole(candidates.map(c=>c.role),ledger?.role??input.role);}catch{const status=candidates.length?"PENDING_ROLE" as const:"PENDING_DATA" as const;await recordSelection(status);return{status};}
  const ranked=candidates.filter(c=>c.role===role).sort((a,b)=>a.priority-b.priority);
  if(ranked.length>1&&ranked[0].priority===ranked[1].priority){await recordSelection("SOURCE_CONFLICT");return{status:"SOURCE_CONFLICT" as const,providers:ranked.filter(c=>c.priority===ranked[0].priority).map(c=>c.provider).sort()};}
  const selected=ranked[0];if(!selected){await recordSelection("PENDING_DATA");return{status:"PENDING_DATA" as const};}
  const enriched=await enrichSelectedStatistics(tx,input,ranked,policy);
  if(enriched&&(enriched.status==="SOURCE_CONFLICT"||enriched.status==="PENDING_DATA")){await recordSelection(enriched.status);return{status:enriched.status};}
  const selectedProvider=enriched?.status==="ENRICHED"?enriched.provider:selected.provider;
  let teEligible:boolean|undefined;
  if(role==="FOOTBALL"){
   const [game]=await tx.$queryRaw<{startsAt:Date|null;startYear:number}[]>`SELECT source_start."resolvedStart" AS "startsAt",season."startYear" FROM "Game" game JOIN "Season" season ON season.id=game."seasonId" ${professionalGameProjection(at)} WHERE game.id=${input.gameId}::uuid`;
   if(game?.startsAt){const eligibility=await getEligiblePositions({playerId:input.playerId,sport:input.sport,seasonYear:game.startYear,asOf:game.startsAt},tx);if(eligibility.available)teEligible=eligibility.positions.includes("TE");}
  }
  const score=await recalculateInTransaction(tx,input.sport,{gameId:input.gameId,playerId:input.playerId,role,sourceProvider:selectedProvider,teEligible,sourceChangeReason:`Reviewed fixture policy ${policy.version} ${fingerprint(policy)}`,reason:"Provider-independent source selection using the existing V9 ledger"});
  await recordSelection(score.changed?"SCORED":"UNCHANGED");
  return{status:score.changed?"SCORED" as const:"UNCHANGED" as const,provider:selectedProvider,observationId:selected.observationId,entry:score.entry};
 },{timeout:30000});
}
