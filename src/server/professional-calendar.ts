import type { Prisma } from '@/generated/prisma/client';
import { calendarDateAt, draftEndsBeforeOpeningDate, projectSeasonDateSnapshots } from '@/scheduling/season-date-policy';
type Client=Pick<Prisma.TransactionClient,'professionalSeasonScheduleRevision'|'professionalDataObservation'>;
/** Date precision never fills the legacy exact DateTime fields. */
export async function getProfessionalCalendar(client:Client,input:{seasonId:string;asOf:Date}){
 const [exact,observations]=await Promise.all([
  client.professionalSeasonScheduleRevision.findFirst({where:{seasonId:input.seasonId,retrievedAt:{lte:input.asOf}},orderBy:{retrievedAt:'desc'}}),
  client.professionalDataObservation.findMany({where:{category:'SEASON_DATE_SNAPSHOT',observedAt:{lte:input.asOf},decisions:{some:{targets:{path:['seasonId'],equals:input.seasonId}}}},include:{decisions:{where:{decidedAt:{lte:input.asOf}},orderBy:{version:'desc'},take:1}}}),
 ]);
 const dates=projectSeasonDateSnapshots({...input,observations});
 if(dates.status==='CONFLICT')return{...dates,status:'CONFLICT' as const,exact:null};
 if(exact?.status==='AVAILABLE'&&exact.regularSeasonStartsAt&&exact.regularSeasonEndsAt){
  if(dates.verifiedDateScope&&dates.verifiedDateScope.sourceZone&&calendarDateAt(exact.regularSeasonStartsAt,dates.verifiedDateScope.sourceZone).date!==dates.verifiedDateScope.regularSeasonStartsOn)return{...dates,status:'CONFLICT' as const,exact:null,conflicts:['EXACT_DATE_CALENDAR_CONFLICT']};
  return{...dates,status:'AVAILABLE' as const,exact};
 }
 return{...dates,exact:null};
}
export async function checkDraftBeforeProfessionalStart(client:Client,input:{seasonId:string;asOf:Date;endsAt:Date}){
 const calendar=await getProfessionalCalendar(client,input);
 if(calendar.status==='CONFLICT')return{allowed:false,verified:true,reason:'CONFLICT: professional season boundary evidence disagrees.',calendar};
 if(calendar.exact?.regularSeasonStartsAt)return{allowed:input.endsAt<calendar.exact.regularSeasonStartsAt,verified:true,reason:'The draft must finish before the verified professional start.',calendar};
 if(calendar.verifiedDateScope)return{allowed:draftEndsBeforeOpeningDate(input.endsAt,calendar.verifiedDateScope),verified:true,reason:'The draft must finish before the announced opening date; opening day is excluded without a verified first kickoff time.',calendar};
 return{allowed:false,verified:false,reason:'PENDING_DATA: a verified professional opening date or instant is required.',calendar};
}
