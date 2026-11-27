import { observedEvidencePolicy, observedPolicyAdoptedAt } from './evidence-policy';
/** Approved event precision policy. Operational boundaries never become exact event timestamps. */
export const operationalEventPolicy=observedEvidencePolicy;
export const operationalEventPolicyAdoptedAt=observedPolicyAdoptedAt.toISOString();
export type OperationalGameClaim={status:'SCHEDULED'|'LIVE'|'SUSPENDED'|'POSTPONED'|'FINAL'|'CANCELLED';observedAt:string;scheduledStartsAt:string|null;actualStartsAt:string|null;completedAt:string|null;pregameVerified?:boolean;startBounds?:{earliest:string|null;latest:string}|null;completionBounds?:{earliest:string|null;latest:string}|null};
export type OperationalGameClock={completionReviewPending?:boolean;operationalLockAt:string|null;started:boolean;operationalCompletedAt:string|null;lockPrecision:'EXACT_VERIFIED'|'BOUNDED_START'|'SCHEDULED_FALLBACK'|'OBSERVED_IN_PROGRESS'|null;completionPrecision:'EXACT_VERIFIED'|'BOUNDED_COMPLETION'|'OBSERVED_FINAL'|null;actualStartsAt:string|null;actualCompletedAt:string|null};
const first=(values:(string|null|undefined)[])=>values.filter((value):value is string=>Boolean(value)).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;
const last=(values:(string|null|undefined)[])=>values.filter((value):value is string=>Boolean(value)).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;
export function operationalGameClock(claim:OperationalGameClaim,previous?:OperationalGameClock):OperationalGameClock{
 const observed=Date.parse(claim.observedAt);
 if(!Number.isFinite(observed)||observed<Date.parse(operationalEventPolicyAdoptedAt))throw Error('Observed event evidence predates the approved policy adoption.');
 for(const value of [claim.actualStartsAt,claim.completedAt,claim.startBounds?.earliest,claim.startBounds?.latest,claim.completionBounds?.earliest,claim.completionBounds?.latest])if(value&&(!Number.isFinite(Date.parse(value))||Date.parse(value)>observed))throw Error('Event evidence cannot be later than observation.');
 for(const bounds of [claim.startBounds,claim.completionBounds])if(bounds?.earliest&&Date.parse(bounds.earliest)>Date.parse(bounds.latest))throw Error('Event bounds are reversed.');
 if(claim.completedAt&&(claim.status!=='FINAL'||(claim.actualStartsAt&&Date.parse(claim.completedAt)<Date.parse(claim.actualStartsAt))))throw Error('Exact completion conflicts with the game state.');
 if(claim.actualStartsAt&&claim.startBounds&&((claim.startBounds.earliest&&Date.parse(claim.actualStartsAt)<Date.parse(claim.startBounds.earliest))||Date.parse(claim.actualStartsAt)>Date.parse(claim.startBounds.latest)))throw Error('Exact start conflicts with supplied interval evidence.');
 if(claim.actualStartsAt&&['SCHEDULED','POSTPONED'].includes(claim.status))throw Error('Pregame state cannot assert an actual start.');
 const started=Boolean(previous?.started||claim.actualStartsAt||['LIVE','SUSPENDED','FINAL'].includes(claim.status));
 const observedStart=started&&!claim.actualStartsAt?claim.startBounds?.earliest??claim.observedAt:null;
 const replacePregame=claim.pregameVerified&&!previous?.started&&['SCHEDULED','POSTPONED'].includes(claim.status);
 const scheduled=previous?.started?previous.operationalLockAt:replacePregame?claim.scheduledStartsAt:first([previous?.operationalLockAt,claim.scheduledStartsAt]);
 const lock=first([scheduled,claim.actualStartsAt,started?previous?.operationalLockAt:null,observedStart]);
 let completion=previous?.operationalCompletedAt??null,precision=previous?.completionPrecision??null;
 if(claim.status==='FINAL'){
  const candidate=claim.completedAt??claim.completionBounds?.latest??claim.observedAt;
  // A re-fetch supplies no new completion fact. Preserve the original observed anchor;
  // an independently established later exact/bounded end may only extend a safe hold.
  completion=completion?claim.completedAt||claim.completionBounds?last([completion,candidate]):completion:candidate;
  if(!previous?.operationalCompletedAt||completion!==previous.operationalCompletedAt)precision=claim.completedAt?'EXACT_VERIFIED':claim.completionBounds?'BOUNDED_COMPLETION':'OBSERVED_FINAL';
 }
 const completionReviewPending=Boolean(previous?.completionReviewPending||(previous?.operationalCompletedAt&&claim.status!=='FINAL'));
 return{completionReviewPending,operationalLockAt:lock,started,operationalCompletedAt:completion,lockPrecision:lock===claim.actualStartsAt?'EXACT_VERIFIED':lock===claim.startBounds?.earliest?'BOUNDED_START':lock===claim.observedAt?'OBSERVED_IN_PROGRESS':lock===previous?.operationalLockAt?previous.lockPrecision:lock?'SCHEDULED_FALLBACK':null,completionPrecision:precision,actualStartsAt:first([previous?.actualStartsAt,claim.actualStartsAt]),actualCompletedAt:claim.completedAt??previous?.actualCompletedAt??null};
}
