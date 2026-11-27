import 'dotenv/config';
import { readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase,persistObservationInTransaction } from '@/ingestion/persist';
import { fingerprint,type Observation } from '@/ingestion/contracts';
import { applyCompetitiveStages,buildReviewedCompetitiveStages,type ReviewedCompetitiveStages } from '@/ingestion/open-data/apply-competitive-stages';
import { createLeague,leagueContext } from '@/server/league';
import { captureGameLineups,pendingGameStarterSnapshots,recordAvailabilityEvidence } from '@/server/lineup-snapshots';
import { recordPositionEvidence } from '@/server/positions';
import { assertOperationalPlayerUnlocked } from '@/server/operational-lineup-lock';
import { recalculateInTransaction } from '@/server/score-ledger';
import { refreshDueAuthoritativeMatchups,finalizeDueMatchups,standings } from '@/server/matchups';
import { correctionAnchor } from '@/server/publication-anchors';
import { participationEvidence } from '@/scoring/participation';
import { playerStatistics } from '@/server/player-statistics';
import { scoreCapturedStarters } from '@/server/competition-scoring';
import type { CompetitiveGameStage } from '@/ingestion/open-data/competitive-records';

assertIsolatedIngestionDatabase();const db=getDatabase();
const serialized=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
const insist=(value:unknown,message:string)=>{if(!value)throw Error(message);};
function statRecords(stage:CompetitiveGameStage){return stage.records.filter((record):record is Observation&{normalized:Extract<Observation['normalized'],{kind:'STAT'}>}=>record.normalized.kind==='STAT');}
function playerId(record:Observation){const id=/^stat:[^:]+:([^:]+):/.exec(record.entityKey)?.[1];if(!id)throw Error('Missing canonical stat player.');return id;}
function fantasyPosition(record:Observation){const positions=(record.raw.historicalObservedPositions??[]) as string[],role=record.normalized.kind==='STAT'?record.normalized.role:null;return role==='GOALIE'?'G':positions.includes('TE')?'TE':positions.includes('QB')?'QB':positions[0]==='L'?'LW':positions[0]==='R'?'RW':positions[0]==='F'?'SF':positions[0]==='G'?'PG':positions[0]??(role==='SKATER'?'F':'PG');}
try{
 if(process.argv.includes('--replay-only')){const path=process.argv[process.argv.indexOf('--replay-only')+1],saved=JSON.parse(await readFile(path,'utf8'));const replay=await db.$transaction(tx=>applyCompetitiveStages(tx,saved.manifest,{expectedFingerprint:saved.fingerprint},new Date(saved.at)),{isolationLevel:'Serializable',timeout:180000});insist(replay.alreadyApplied&&replay.newStatistics===0&&replay.newScoreEntries===0,'Restart replay changed reviewed source data.');console.log(JSON.stringify(replay));}
 else{
  const original=JSON.parse(await readFile('data/stat_enrichment/competitive_processing/reviewed_three_game_manifest.json','utf8')) as ReviewedCompetitiveStages;
  const reviewer=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}}),contexts=[];
  for(const stage of original.stages){
   const lockAt=new Date(stage.game.scheduledStartsAt!),before=new Date(+lockAt-3600000),sport=stage.game.sport;
   const league=await createLeague(reviewer.id,{name:`CONTROLLED real-source ${sport} ${randomUUID()}`,sports:[sport],maxTeams:2,historical:true,seasonYear:2026,fillWithComputers:true});
   const competition=await db.sportCompetition.findFirstOrThrow({where:{leagueId:league.id},include:{leagueSportSeason:true}}),franchises=await db.fantasyTeam.findMany({where:{leagueId:league.id},orderBy:{draftSlot:'asc'}});
   const period=await db.scoringPeriod.create({data:{leagueId:league.id,leagueSportId:competition.leagueSportSeason.leagueSportId,sport,number:stage.game.week??1,startsAt:before,endsAt:new Date(+lockAt+4*3600000),competitionId:competition.id}});
   await db.competitionPeriodGame.create({data:{sportCompetitionId:competition.id,scoringPeriodId:period.id,gameId:stage.game.id}});
   const matchup=await db.matchup.create({data:{leagueId:league.id,sport,periodId:period.id,homeTeamId:franchises[0].id,awayTeamId:franchises[1].id}});
   await db.league.update({where:{id:league.id},data:{isHistorical:false,isDemo:false}});
   await db.commissionerAuditEvent.create({data:{leagueId:league.id,actorUserId:reviewer.id,action:'ISOLATED_HYPOTHETICAL_PRELOCK_SETUP',targetType:'Game',targetId:stage.game.id,sport,before:{},after:{scope:'SYNTHETIC_LEAGUE_OWNERSHIP_ELIGIBILITY_AND_CLOCK_ONLY; professional IDs, source values and scheduled time remain actual',hypotheticalAt:before.toISOString(),professionalGameTimeChanged:false},reason:'Isolated mechanical acceptance only; these prelock ownership and eligibility timestamps are hypothetical fixtures, not production historical evidence.'}});
   const records=statRecords(stage),played=records.filter(record=>participationEvidence({provider:record.provider,role:record.normalized.role,normalized:record.normalized.stats,raw:record.raw,terminal:true}).status==='PLAYED');
   const starters=(sport==='NFL'?played.filter(record=>fantasyPosition(record)==='QB'):sport==='NHL'?played.filter(record=>record.normalized.role==='SKATER'):played).slice(0,2);insist(starters.length===2,'Need two genuinely participating source starter records.');
   const others=played.filter(record=>!starters.some(start=>playerId(start)===playerId(record))).slice(0,2);insist(others.length===2,'Need actual bench and IR source records to prove exclusion.');
   // Explicitly hypothetical eligibility in the disposable test context. Do not
   // create this evidence in development or present it as historical chronology.
   for(const record of sport==='NFL'?records:[...starters,...others])await recordPositionEvidence({playerId:playerId(record),seasonId:competition.leagueSportSeason.seasonId,code:fantasyPosition(record),kind:'LISTED',effectiveAt:before,knownAt:before,provider:'isolated-hypothetical-prelock-eligibility',externalId:`${league.id}:${playerId(record)}`});
   const entries:{playerId:string}[]=[];
   for(const[index,record]of [...starters,...others].entries()){
    const team=franchises[index===1?1:0],roster=await db.fantasyRoster.findUniqueOrThrow({where:{teamId_leagueSportId:{teamId:team.id,leagueSportId:competition.leagueSportSeason.leagueSportId}}}),position=fantasyPosition(record),slot=index===2?'BENCH':index===3?'UNIVERSAL_IR':sport==='NHL'&&position!=='D'?'F':position;
    const entry=await db.rosterEntry.create({data:{leagueId:league.id,teamId:team.id,rosterId:roster.id,playerId:playerId(record),sport,seasonId:competition.leagueSportSeason.seasonId,slot,slotIndex:1,acquiredAt:before}});
    await db.rosterAssignmentEvent.create({data:{leagueId:league.id,teamId:team.id,rosterEntryId:entry.id,toSlot:slot,toSlotIndex:1,effectiveAt:before,reason:'ISOLATED HYPOTHETICAL prelock manager assignment; not a production historical claim',idempotencyKey:randomUUID()}});
    await recordAvailabilityEvidence({playerId:entry.playerId,gameId:stage.game.id,designation:index===3?'OUT':'UNKNOWN',irEligible:index===3,effectiveAt:before,knownAt:before,provider:'isolated-hypothetical-availability-context',externalId:`${league.id}:${entry.id}`,sourceRecord:{synthetic:true,actualProfessionalHealthClaim:false,reason:'Fixture game membership only; UNKNOWN is not healthy by omission.'}});entries.push(entry);
   }
   insist((await db.$transaction(tx=>pendingGameStarterSnapshots(tx,stage.game.id,new Date(+lockAt+1000)))).pending,'Missing starters did not block before capture.');
   const captured=await captureGameLineups(stage.game.id,new Date(+lockAt+1000));insist(captured.status==='CAPTURED'&&captured.created>=4,'Controlled immutable source-linked snapshot capture failed.');
   const snapshots=await db.gameLineupSnapshot.findMany({where:{gameId:stage.game.id,sportCompetitionId:competition.id},orderBy:{id:'asc'}});insist(snapshots.filter(row=>row.isStarter).length===2,'Bench/IR entered starter snapshots.');
   let lockRejected=false;try{await db.$transaction(tx=>assertOperationalPlayerUnlocked(tx,league.id,entries[0].playerId,new Date(+lockAt+60000)));}catch{lockRejected=true;}insist(lockRejected,'Delayed source observation allowed a post-start lineup window.');
   contexts.push({stage,league,competition,matchup,period,franchises,entries,starters,snapshots,lockRejected});
  }
  const requestedAt=new Date(),manifest=await db.$transaction(tx=>buildReviewedCompetitiveStages(tx,original.stages,original.sourceFiles,true),{isolationLevel:'RepeatableRead'}),reviewFingerprint=fingerprint(manifest);
  const dry=await db.$transaction(tx=>applyCompetitiveStages(tx,manifest,undefined,requestedAt)),applied=await db.$transaction(tx=>applyCompetitiveStages(tx,manifest,{expectedFingerprint:reviewFingerprint},requestedAt),{isolationLevel:'Serializable',timeout:180000});insist(applied.completeBoxes===3&&applied.pendingBoxes===0,'Three full real source boxes did not pass the existing engine.');
  const at=new Date('completedProcessingAt' in applied?String(applied.completedProcessingAt):requestedAt.toISOString());
  const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,replayPath=`data/stat_enrichment/competitive_processing/replay-${schema}.json`;
  await writeFile(replayPath,JSON.stringify({manifest,fingerprint:reviewFingerprint,at:at.toISOString()},null,2)+'\n');
  const child=spawnSync(process.execPath,['--import','tsx','src/workers/validate-real-competitive-stages.ts','--replay-only',replayPath],{env:process.env,encoding:'utf8',maxBuffer:1024*1024});if(child.status!==0)throw Error(child.stderr||'Actual new-process source replay failed.');
  const restartReplay=JSON.parse(child.stdout.trim());
  const results=[];
  for(const context of contexts){
   const{stage,league,competition,matchup,starters,snapshots}=context;
   const anchor=await db.$transaction(tx=>correctionAnchor(tx,stage.game.id,at));insist(anchor&&!anchor.invalidated,'Missing observed complete-box anchor.');
   const expected=[];for(const record of starters){const ledger=await db.scoreLedger.findUniqueOrThrow({where:{gameId_playerId_presetId:{gameId:stage.game.id,playerId:playerId(record),presetId:league.presetId}},include:{entries:{orderBy:{sequence:'desc'},take:1}}});insist(!ledger.entries[0].missingStats.length,'A source starter lacks a complete V9 result.');expected.push(ledger.entries[0].totalTenths);}
   await refreshDueAuthoritativeMatchups(at,league.id);const provisional=await db.matchup.findUniqueOrThrow({where:{id:matchup.id}});insist(provisional.homeTenths===expected[0]&&provisional.awayTenths===expected[1]&&provisional.resultFinalizesAt?.getTime()===anchor!.deadlineAt.getTime(),'Real provisional competition points or shared deadline differ.');
   insist(await finalizeDueMatchups(new Date(+anchor!.deadlineAt-1),league.id)===0,'Finalized before the controlled24-hour deadline.');insist(await finalizeDueMatchups(new Date(+anchor!.deadlineAt+1),league.id)===1,'Failed controlled24-hour finalization.');
   const final=await db.matchup.findUniqueOrThrow({where:{id:matchup.id}}),table=await standings(league.id,stage.game.sport),website=await leagueContext(reviewer.id,league.id),analytics=await playerStatistics({playerIds:starters.map(playerId),presetId:league.presetId,seasonId:competition.leagueSportSeason.seasonId});
   insist(final.status==='FINAL'&&table.length===2&&website?.league.id===league.id&&analytics.size===2,'Final competitive website presentation is missing.');
   // Separate synthetic correction episode, after the real-source result is final.
   // Never attribute this fabricated test correction to either real publisher.
   const originalRecord=starters[0],correctedAt=new Date(+anchor!.deadlineAt+3600000),field=stage.game.sport==='NFL'?'passing_yards':stage.game.sport==='NBA'?'PTS':'goals',stats={...originalRecord.normalized.stats,[field]:(originalRecord.normalized.stats[field]??0)+10};
   const fixture:Observation={...originalRecord,provider:`isolated-synthetic-correction-${randomUUID()}`,observedAt:correctedAt.toISOString(),revisionToken:'synthetic-correction-only',revisionOrdinal:1,sourceReference:'https://fixture.invalid/synthetic-correction-mechanic',raw:{synthetic:true,actualProfessionalCorrection:false,sourceBaseline:stage.sourceFingerprint},normalized:{...originalRecord.normalized,phase:'CORRECTION',stats}};
   await db.$transaction(async tx=>{const receipt=await persistObservationInTransaction(tx,fixture,correctedAt);insist(receipt.outcome==='ACCEPTED','Synthetic correction fixture not accepted in isolated schema.');await recalculateInTransaction(tx,stage.game.sport,{gameId:stage.game.id,playerId:playerId(originalRecord),role:originalRecord.normalized.role,sourceProvider:fixture.provider,teEligible:stage.game.sport==='NFL'?false:undefined,sourceChangeReason:'ISOLATED synthetic correction only; not actual publisher evidence',reason:'Protect previously finalized real-source result under a separate fabricated test correction'});},{isolationLevel:'Serializable',timeout:120000});
   await refreshDueAuthoritativeMatchups(correctedAt,league.id);await finalizeDueMatchups(correctedAt,league.id);
   insist(serialized(await db.matchup.findUniqueOrThrow({where:{id:matchup.id}}))===serialized(final),'Synthetic post-final correction altered a finalized result.');
   insist(serialized(await db.gameLineupSnapshot.findMany({where:{gameId:stage.game.id,sportCompetitionId:competition.id},orderBy:{id:'asc'}}))===serialized(snapshots),'Immutable starter snapshots changed.');
   const totals=await db.$transaction(tx=>scoreCapturedStarters(tx,[competition.id],correctedAt,{periodId:context.period.id}));
   results.push({sport:stage.game.sport,canonicalGameId:stage.game.id,sourceGameId:stage.game.externalId,leagueId:league.id,realStatRows:statRecords(stage).length,starterPlayerIds:starters.map(playerId),all15StagesDemonstrated:false,mechanicalStagesDemonstrated:14,websitePresentation:'READ_MODELS_ONLY_PENDING_BROWSER',realSourceProvisional:[provisional.homeTenths.toString(),provisional.awayTenths.toString()],finalizedRealSource:[final.homeTenths.toString(),final.awayTenths.toString()],anchorAt:anchor!.anchorAt,deadlineAt:anchor!.deadlineAt,benchAndIrExcluded:true,immutableStarterSnapshots:true,lateLineupRejected:context.lockRejected,postFinalSyntheticCorrectionProtected:true,actualProfessionalCorrectionEpisode:false,websiteStandingsRows:table.length,websiteAnalyticsPlayers:analytics.size,independentSportTotals:totals.length});
  }
  const report={targetDatabase:'fantasy_evolution_test',developmentWrites:0,realProfessionalEvidence:'Actual canonical IDs, retained permitted source rows, normalized V9 counts, unchanged accepted schedule and observed processing clocks',syntheticFantasyEvidence:'Explicit hypothetical pre-lock ownership/eligibility/availability fixture and controlled24-hour clock advancement; not actual historical production chronology',physicalEventInstantsInvented:false,officialPublicationInvented:false,genuineLiveFeedDemonstrated:false,actualProfessionalCorrectionEpisode:false,websitePresentation:'READ_MODELS_ONLY_PENDING_BROWSER',all15StagesDemonstrated:false,dry,applied,restartReplay,results};
  await writeFile('data/stat_enrichment/m5_real_competitive_stage_validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }
}finally{await db.$disconnect();}
