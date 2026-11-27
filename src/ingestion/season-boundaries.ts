import type{Prisma}from"@/generated/prisma/client";
import{scheduleSourceSchema}from"@/server/scheduling";
import{fingerprint,type Observation}from"./contracts";
type Boundary=Observation&{normalized:Extract<Observation["normalized"],{kind:"SEASON_BOUNDARY"}>};
export async function promoteSeasonBoundary(tx:Prisma.TransactionClient,input:Boundary,observationId:string){
 const n=input.normalized;
 const pending=(reason:string)=>({outcome:"PENDING_DATA" as const,reason,targets:{}});
 const reject=(reason:string)=>({outcome:"QUARANTINED" as const,reason,targets:{}});
 if(!input.publishedAt||!input.effectiveAt)return pending("Boundary evidence needs explicit source publication/effective timestamps; first/last observed games do not prove season bounds.");
 if(new Date(input.publishedAt)<new Date(input.effectiveAt))return reject("Season-boundary evidence cannot be known before its effective instant.");
 if(n.status==="AVAILABLE"&&!n.independentlyVerified)return pending("Independently verified regular/postseason boundaries are required before availability is granted.");
 if(input.entityKey!==`season:${input.sport}:${n.seasonStartYear}`)return reject("Use the stable professional sport-season boundary stream key.");
 const row={sport:input.sport,startYear:n.seasonStartYear,label:n.label,status:n.status,reason:n.reason??undefined,regularSeasonStartsAt:n.regularSeasonStartsAt??undefined,regularSeasonEndsAt:n.regularSeasonEndsAt??undefined,postseasonStartsAt:n.postseasonStartsAt??undefined,postseasonEndsAt:n.postseasonEndsAt??undefined};
 const validated=scheduleSourceSchema.safeParse({provider:input.provider,sourceName:input.sourceReference,sourceVersion:input.revisionToken,retrievedAt:input.observedAt,seasons:[row]});
 if(!validated.success)return reject("Season boundary ordering or required verified dates are invalid.");
 if(n.postseasonStartsAt&&n.regularSeasonEndsAt&&new Date(n.postseasonStartsAt)<new Date(n.regularSeasonEndsAt))return reject("Postseason start conflicts with regular-season end.");
 const season=await tx.season.upsert({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}},update:{},create:{sport:input.sport,startYear:n.seasonStartYear,label:n.label,coverageReason:"Explicit source season metadata; statistical coverage remains independently verified."}});
 const previous=await tx.professionalSeasonScheduleRevision.findMany({where:{seasonId:season.id},orderBy:{retrievedAt:"desc"}});
 if(previous.some(r=>r.provider===input.provider&&r.retrievedAt>new Date(input.observedAt)))return pending("A recovered boundary revision predates existing retrieval history; review its ordered source projection before replacing current bounds.");
 const shape=(r:{regularSeasonStartsAt:Date|null;regularSeasonEndsAt:Date|null;postseasonStartsAt:Date|null;postseasonEndsAt:Date|null})=>fingerprint([r.regularSeasonStartsAt?.toISOString()??null,r.regularSeasonEndsAt?.toISOString()??null,r.postseasonStartsAt?.toISOString()??null,r.postseasonEndsAt?.toISOString()??null]);
 const dates=validated.data.seasons[0],canonical={regularSeasonStartsAt:dates.regularSeasonStartsAt??null,regularSeasonEndsAt:dates.regularSeasonEndsAt??null,postseasonStartsAt:dates.postseasonStartsAt??null,postseasonEndsAt:dates.postseasonEndsAt??null};
 const otherSources=new Map<string,typeof previous[number]>();for(const r of previous)if(r.provider!==input.provider&&!otherSources.has(r.provider))otherSources.set(r.provider,r);
 if([...otherSources.values()].some(r=>r.status==="AVAILABLE"&&(n.status!=="AVAILABLE"||shape(r)!==shape(canonical))))return reject("Independent sources disagree about season boundaries; reviewed arbitration is required rather than latest-fetch selection.");
 const revision=await tx.professionalSeasonScheduleRevision.create({data:{seasonId:season.id,provider:input.provider,status:n.status,sourceName:input.sourceReference,sourceVersion:input.revisionToken,contentHash:fingerprint({observationId,normalized:n}),retrievedAt:new Date(input.observedAt),...canonical,reason:n.reason,sourceRecord:{observationId,sourceReference:input.sourceReference,publishedAt:input.publishedAt,effectiveAt:input.effectiveAt,observedAt:input.observedAt,independentlyVerified:n.independentlyVerified,raw:input.raw}}});
 return{outcome:"ACCEPTED" as const,reason:"Independent boundary evidence appended; selected seasons, cycle ownership and existing league overrides are unchanged.",targets:{seasonId:season.id,scheduleRevisionId:revision.id}};
}

/** Separate date-precision announcement path: no fabricated DateTime boundary fields. */
export async function promoteSeasonDateSnapshot(tx:Prisma.TransactionClient,input:{provider:string;sport:import('@/generated/prisma/enums').Sport;entityKey:string;revisionOrdinal:number|null;sourceReference:string;observedAt:string;effectiveAt:string|null;publishedAt:string|null;normalized:unknown},processedAt=new Date()){
 const {seasonDateSnapshotSchema}=await import('@/scheduling/season-date-policy');
 const {observedPolicyAdoptedAt}=await import('./evidence-policy');
 const n=seasonDateSnapshotSchema.parse(input.normalized),reject=(reason:string)=>({outcome:'QUARANTINED' as const,reason,targets:{}});
 if(input.effectiveAt!==null||input.publishedAt!==null||input.revisionOrdinal===null||+new Date(n.policyAdoptedAt)!==+observedPolicyAdoptedAt)return reject('Date snapshots retain unknown exact source clocks and explicit ordered reviewed facts.');
 if(input.entityKey!==`season-date:${input.sport}:${n.seasonStartYear}`)return reject('Use the stable professional season date stream.');
 const source=new URL(input.sourceReference);if(source.protocol!=='https:'||!['www.nfl.com','www.nba.com','www.nhl.com','www.mlb.com'].includes(source.hostname))return reject('Calendar facts require reviewed official primary-source announcements.');
 const season=await tx.season.upsert({where:{sport_startYear:{sport:input.sport,startYear:n.seasonStartYear}},update:{},create:{sport:input.sport,startYear:n.seasonStartYear,label:n.label,coverageReason:'Verified announced date scope only; exact clocks, schedule completeness and statistical coverage remain independent.'}});
 const operationalEffectiveAt=new Date(Math.max(+processedAt,+new Date(n.validFrom),+new Date(n.firstObservedAt),+observedPolicyAdoptedAt)).toISOString();
 return{outcome:'ACCEPTED' as const,reason:'Independent announced calendar dates retained with explicit zone/precision; exact professional boundary fields unchanged.',targets:{seasonId:season.id,operationalEffectiveAt,exactEffectiveAt:null,officialPublishedAt:null,calendarPrecision:'DAY',policyVersion:n.policyVersion}};
}
