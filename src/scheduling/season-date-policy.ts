import { z } from 'zod';
export const seasonDateSnapshotSchema=z.object({kind:z.literal('SEASON_DATE_SNAPSHOT'),seasonStartYear:z.number().int().min(1900).max(2200),label:z.string().min(1).max(30),regularSeasonStartsOn:z.iso.date(),regularSeasonEndsOn:z.iso.date(),sourceZone:z.string().min(1).max(100).nullable(),precision:z.literal('DAY'),sourceRecordId:z.string().min(1).max(300),reviewedFactsFingerprint:z.string().regex(/^[a-f0-9]{64}$/),proofKind:z.literal('REVIEWED_OFFICIAL_PUBLIC_CALENDAR_FACTS'),independentlyVerified:z.literal(true),firstObservedAt:z.iso.datetime({offset:true}),policyAdoptedAt:z.iso.datetime({offset:true}),validFrom:z.iso.datetime({offset:true}),retracted:z.boolean(),policyVersion:z.literal('approved-season-date-snapshot-1')}).strict().superRefine((n,ctx)=>{
 if(n.regularSeasonStartsOn>=n.regularSeasonEndsOn)ctx.addIssue({code:'custom',message:'Calendar end must follow start.'});
 if(Number(n.regularSeasonStartsOn.slice(0,4))!==n.seasonStartYear||![n.seasonStartYear,n.seasonStartYear+1].includes(Number(n.regularSeasonEndsOn.slice(0,4))))ctx.addIssue({code:'custom',message:'Season dates must match explicit season identifiers.'});
 if(+new Date(n.validFrom)<Math.max(+new Date(n.firstObservedAt),+new Date(n.policyAdoptedAt)))ctx.addIssue({code:'custom',message:'Observed calendar evidence is prospective.'});
 if(n.sourceZone)try{new Intl.DateTimeFormat('en-US',{timeZone:n.sourceZone}).format();}catch{ctx.addIssue({code:'custom',message:'Source timezone must be an explicit valid IANA zone.'});}
});
export type SeasonDateSnapshot=z.infer<typeof seasonDateSnapshotSchema>;
export function calendarDateAt(at:Date,sourceZone:string|null){
 const zone=sourceZone??'Pacific/Kiritimati';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at),value=(type:string)=>parts.find(part=>part.type===type)!.value;
 return{date:`${value('year')}-${value('month')}-${value('day')}`,comparisonZone:zone,comparisonBasis:sourceZone?'VERIFIED_SOURCE_ZONE':'CONSERVATIVE_GLOBAL_DATE_EXCLUSION'};
}
/** A date-only opening cannot authorize a draft ending on that date, even before an estimated kickoff. */
export function draftEndsBeforeOpeningDate(endsAt:Date,calendar:Pick<SeasonDateSnapshot,'regularSeasonStartsOn'|'sourceZone'>){return calendarDateAt(endsAt,calendar.sourceZone).date<calendar.regularSeasonStartsOn;}
export type SeasonDateObservation={id:string;provider:string;entityKey:string;revisionOrdinal:bigint|null;observedAt:Date;normalized:unknown;decisions:{outcome:string;decidedAt:Date;targets:unknown}[]};
export function projectSeasonDateSnapshots(input:{seasonId:string;asOf:Date;observations:readonly SeasonDateObservation[]}){
 const latest=new Map<string,{value:SeasonDateSnapshot;row:SeasonDateObservation;conflict:boolean}>();
 for(const row of input.observations){const parsed=seasonDateSnapshotSchema.safeParse(row.normalized),decision=row.decisions[0],targets=decision?.targets as {seasonId?:unknown;operationalEffectiveAt?:unknown}|undefined;
  if(!parsed.success||decision?.outcome!=='ACCEPTED'||targets?.seasonId!==input.seasonId||typeof targets.operationalEffectiveAt!=='string'||new Date(targets.operationalEffectiveAt)>input.asOf||new Date(parsed.data.validFrom)>input.asOf||row.observedAt>input.asOf||decision.decidedAt>input.asOf||row.revisionOrdinal==null)continue;
  const key=`${row.provider}:${row.entityKey}`,previous=latest.get(key);if(!previous||row.revisionOrdinal>previous.row.revisionOrdinal!)latest.set(key,{value:parsed.data,row,conflict:false});else if(row.revisionOrdinal===previous.row.revisionOrdinal&&JSON.stringify(parsed.data)!==JSON.stringify(previous.value))previous.conflict=true;
 }
 const active=[...latest.values()].filter(item=>!item.value.retracted),conflicts=active.filter(item=>item.conflict).map(item=>item.row.id);
 if(active.some(item=>item.value.regularSeasonStartsOn!==active[0].value.regularSeasonStartsOn||item.value.regularSeasonEndsOn!==active[0].value.regularSeasonEndsOn)||new Set(active.map(item=>item.value.sourceZone).filter(Boolean)).size>1)conflicts.push('INDEPENDENT_CALENDAR_CONFLICT');
 const selected=active.find(item=>item.value.sourceZone)??active[0];
 return{status:conflicts.length?'CONFLICT' as const:selected?'VERIFIED_DATES' as const:'PENDING_DATA' as const,verifiedDateScope:conflicts.length?null:selected?.value??null,observationId:conflicts.length?null:selected?.row.id??null,conflicts};
}
