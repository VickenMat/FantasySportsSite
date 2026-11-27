import {fingerprint} from '@/ingestion/contracts';
export type PitchingAppearanceEvidence={sourcePlayerId:string;sourceGameId:string;sourceTeamId:string;seasonStartYear:number;gameDate:string;sourceRow:number;sourceRowFingerprint:string;gamesStarted:number|null;gamesPitched:number|null;participation:'PLAYED'|'DID_NOT_PLAY'|'UNKNOWN';acceptedPhase:'REGULAR'|null};
/** Historical DAY thresholds only; source publication remains unknown. */
export function deriveHistoricalPitchingThresholds(rows:readonly PitchingAppearanceEvidence[]){
 const groups=new Map<string,PitchingAppearanceEvidence[]>();const withheld:{key:string;reason:string}[]=[];
 for(const row of rows){const key=`${row.seasonStartYear}:${row.sourcePlayerId}:${row.sourceGameId}`;groups.set(key,[...(groups.get(key)??[]),row]);}
 const seasons=new Map<string,PitchingAppearanceEvidence[]>();
 for(const [key,values]of groups){
  const semantics=new Set(values.map(value=>fingerprint({player:value.sourcePlayerId,game:value.sourceGameId,year:value.seasonStartYear,team:value.sourceTeamId,date:value.gameDate,starts:value.gamesStarted,pitched:value.gamesPitched,participation:value.participation,phase:value.acceptedPhase})));
  if(semantics.size!==1){withheld.push({key,reason:'CONFLICTING_DUPLICATE_GAME_EVIDENCE'});continue;}
  const row=[...values].sort((a,b)=>a.sourceRow-b.sourceRow)[0];
  if(row.acceptedPhase!=='REGULAR'){withheld.push({key,reason:'NO_ACCEPTED_REGULAR_SEASON_PHASE'});continue;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.gameDate)||Number(row.gameDate.slice(0,4))!==row.seasonStartYear||!Number.isFinite(Date.parse(row.gameDate))||new Date(row.gameDate).toISOString().slice(0,10)!==row.gameDate){withheld.push({key,reason:'INVALID_DATED_SEASON_TUPLE'});continue;}
  if((row.gamesStarted!==null&&![0,1].includes(row.gamesStarted))||(row.gamesPitched!==null&&![0,1].includes(row.gamesPitched))||row.gamesStarted===1&&row.gamesPitched===0||row.participation==='UNKNOWN'){withheld.push({key,reason:'UNKNOWN_OR_CONTRADICTORY_PITCHING_PARTICIPATION'});continue;}
  if(row.gamesPitched!==1||row.participation!=='PLAYED')continue;
  const playerSeason=`${row.seasonStartYear}:${row.sourcePlayerId}`;seasons.set(playerSeason,[...(seasons.get(playerSeason)??[]),row]);
 }
 const thresholds=[];
 for(const values of seasons.values()){
  const ordered=[...values].sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.sourceGameId.localeCompare(b.sourceGameId));
  for(const [position,threshold,basis,predicate]of [['SP',10,'EXPLICIT_STARTS',(row:PitchingAppearanceEvidence)=>row.gamesStarted===1],['RP',20,'EXPLICIT_RELIEF_APPEARANCES',(row:PitchingAppearanceEvidence)=>row.gamesStarted===0],['P',20,'EXPLICIT_PITCHING_APPEARANCES',()=>true]] as const){
   const qualifying=ordered.filter(predicate);if(qualifying.length<threshold)continue;const reached=qualifying[threshold-1];
   thresholds.push({playerKey:`MLB:v9-historical:${reached.sourcePlayerId}`,sourcePlayerId:reached.sourcePlayerId,seasonStartYear:reached.seasonStartYear,position,threshold,basis,thresholdReachedOn:reached.gameDate,effectivePrecision:'DAY' as const,knownAt:null,strictEligibility:false,currentEligibilityChanged:false,sameThresholdGamePregameGrant:false,earliestSensitivityUse:'SUBSEQUENT_DAY_ONLY' as const,followingSeasonCarryCandidate:reached.seasonStartYear+1,followingSeasonEffectiveDate:null,distinctQualifyingGames:qualifying.length,thresholdEvidence:qualifying.slice(0,threshold).map(row=>({sourceGameId:row.sourceGameId,gameDate:row.gameDate,sourceRow:row.sourceRow,sourceRowFingerprint:row.sourceRowFingerprint,gamesStarted:row.gamesStarted,gamesPitched:row.gamesPitched}))});
  }
 }
 thresholds.sort((a,b)=>`${a.seasonStartYear}:${a.sourcePlayerId}:${a.position}`.localeCompare(`${b.seasonStartYear}:${b.sourcePlayerId}:${b.position}`));withheld.sort((a,b)=>a.key.localeCompare(b.key));
 return{thresholds,withheld,datedPitchingAppearances:[...seasons.values()].reduce((sum,values)=>sum+values.length,0),fieldingThresholdDatesAvailable:false,dhThresholdDatesAvailable:false};
}
