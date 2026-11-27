import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Prisma,PrismaClient} from '@/generated/prisma/client';
import {getDatabase} from '@/lib/db';
import {fingerprint,retryDelay} from '../contracts';
import {assertIsolatedIngestionDatabase} from '../persist';
import {observedPolicyAdoptedAt} from '../evidence-policy';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {releaseRegistry,releaseRetrievalEnabled} from './registry';
import {collectReadOnlyCompetitiveStages} from './collect-competitive';
import {buildReviewedCompetitiveStages,applyCompetitiveStages} from './apply-competitive-stages';
import type {CompetitiveGameStage,CompetitiveSourceProof} from './competitive-records';
import {lockSport} from '@/server/sport-lock';
export const competitionSports=['NFL','NBA','NHL'] as const;
type CompetitionSport=typeof competitionSports[number];
const productIds=['nfl-statistics-2026','nfl-results-2026','nba-boxscores-2027','nba-schedule-results-2027','nhl-game-info-2027','nhl-skaters-2027','nhl-goalies-2027','nhl-events-2027','nhl-scoring-2027'];
const crosswalk={id:'nba-schedule-crosswalk-2027',sourceUrl:'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_crosswalk/nba_schedule_crosswalk_2027.csv',license:'CC-BY-4.0',maxBytes:1024*1024};
export const recurringCompetitionPolicy={version:'PROSPECTIVE_EXISTING_REGULAR_FINAL_BOXES_2026_V1',databaseScope:'LOCALHOST_FANTASY_EVOLUTION_DEFAULT_PUBLIC_SCHEMA_ONLY',seasonStartYear:2026,sports:competitionSports,
 products:productIds.map(id=>{const source=releaseRegistry.find(row=>row.id===id);if(!source)throw Error(`Missing competition product ${id}`);return{id,sourceUrl:source.sourceUrl,license:source.license,licenseReference:source.licenseReference,maxBytes:source.maxBytes};}),staticIdBridge:crosswalk,
 scheduledStart:'AT_OR_AFTER_SEPARATE_APPROVAL_PROCESSING_FLOOR',primaryBox:'IMMUTABLE_BODY_FIRST_RECEIPT_AT_OR_AFTER_SEPARATE_APPROVAL',maxGamesPerSportCycle:1,minIntervalMs:60000,leaseMs:235000,maxRecordsPerGame:200,maxStagesPerSport:2000,maxSourceAgeMs:48*3600000,
 scoringPreset:'ubp-v9-experimental',scoringRulesFingerprint:fingerprint(ubpV9Rules),scope:'EXISTING_REAL_CANONICAL_REGULAR_GAME_AND_FULL_FINAL_BOX_NO_HELD_FIELDS',allowedWrites:['PROFESSIONAL_OBSERVATIONS_AND_DECISIONS','COMPLETE_BOX_OPERATIONAL_CLOCK','SOURCE_STAT_REVISIONS','GLOBAL_V9_SCORE_LEDGER_REVISIONS','SPORT_PROGRESS_AND_LEASE'],
 excludes:['HISTORICAL_BACKFILL','PRE_APPROVAL_GAMES_AND_PRIMARY_BODIES','NEW_IDENTITIES','NEW_GAMES','NEW_TEAMS','OWNERSHIP','FINANCIAL_RECORDS','PROVIDER_SWITCHES','V10','CONTRACT_AUTOMATION','FORCED_FINALIZED_RESULT_CHANGES'],sourceClockPolicy:'UNKNOWN_EXACT_COMPLETION_AND_PUBLICATION_REMAIN_NULL;OPERATIONAL_CLOCKS_ONLY',snapshotPolicy:'SEPARATE_CB8_AUTHORIZATION_NOT_EXPANDED',
} as const;
export const recurringCompetitionPolicyFingerprint=fingerprint(recurringCompetitionPolicy);
export const recurringCompetitionAuthorizationPath='data/operations/recurring_competition_authorization.json';
const authorizationSchema=z.object({enabled:z.literal(true),policyFingerprint:z.string().regex(/^[a-f0-9]{64}$/),approvedAt:z.iso.datetime({offset:true})}).strict();
export async function loadRecurringCompetitionAuthorization(testAuthorization?:unknown){
 if(testAuthorization!==undefined){assertIsolatedIngestionDatabase();return authorizationSchema.safeParse(testAuthorization);}
 let local=false;try{const url=new URL(process.env.DATABASE_URL??'');local=['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/fantasy_evolution'&&!url.searchParams.has('schema');}catch{}
 if(!local)return authorizationSchema.safeParse(null);
 try{return authorizationSchema.safeParse(JSON.parse(await readFile(recurringCompetitionAuthorizationPath,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return authorizationSchema.safeParse(null);throw error;}
}
export function recurringCompetitionStageHold(stage:CompetitiveGameStage,proofs:readonly CompetitiveSourceProof[],approvedAt:Date,at:Date){
 if(stage.game.seasonYear!==2026||!competitionSports.includes(stage.game.sport as CompetitionSport)||stage.game.phase!=='REGULAR')return 'OUTSIDE_CURRENT_CANONICAL_REGULAR_SCOPE';
 const start=Date.parse(stage.game.scheduledStartsAt??'');if(!Number.isFinite(start)||start<+approvedAt||start>+at)return 'SCHEDULED_START_OUTSIDE_PROSPECTIVE_CUTOVER';
 if(!stage.completeBoxBindingReady||stage.holds.length||stage.expectedSourcePlayers<1||stage.historicalV9CompletePlayers!==stage.expectedSourcePlayers||stage.records.length!==stage.expectedSourcePlayers+1||stage.records.length>recurringCompetitionPolicy.maxRecordsPerGame)return 'INCOMPLETE_OR_CONFLICTED_FINAL_BOX';
 if(stage.records.some(row=>row.sport!==stage.game.sport||row.effectiveAt!==null||row.publishedAt!==null||new Date(row.observedAt)>at||!['GAME_STATE','STAT'].includes(row.normalized.kind)))return 'UNSUPPORTED_SOURCE_RECORD_OR_CLOCK';
 const primary=stage.game.sport==='NFL'?['nfl-statistics-2026']:stage.game.sport==='NBA'?['nba-boxscores-2027']:['nhl-skaters-2027','nhl-goalies-2027'];
 for(const id of primary){const expected=recurringCompetitionPolicy.products.find(row=>row.id===id)!,proof=proofs.find(row=>row.sourceUrl===expected.sourceUrl);const received=Date.parse(proof?.receivedAt??'');if(!proof||!Number.isFinite(received)||received<+approvedAt)return 'PRE_APPROVAL_OR_UNVERIFIED_PRIMARY_BOX_BODY';if(received>+at||+at-received>recurringCompetitionPolicy.maxSourceAgeMs)return 'PRIMARY_BODY_OUTSIDE_FRESHNESS';}
 return null;
}
type Collection=Pick<Awaited<ReturnType<typeof collectReadOnlyCompetitiveStages>>,'stages'|'proofs'|'sourceFiles'>;
type Options={db?:PrismaClient;clock?:()=>Date;testAuthorization?:unknown;testCollect?:(sport:CompetitionSport)=>Promise<Collection>};
const keyFor=(sport:CompetitionSport)=>({provider:'internal-recurring-competition',sport,stream:`PROSPECTIVE_FINAL_BOXES:${recurringCompetitionPolicyFingerprint}`});
async function verifySources(collection:Collection){
 for(const source of collection.sourceFiles){const proof=collection.proofs.find(proof=>proof.sha256===source.sha256);const allowed=proof&&[...recurringCompetitionPolicy.products,crosswalk].find(row=>row.sourceUrl===proof.sourceUrl);if(!proof||!allowed)throw Error('Unapproved recurring competitive source.');const bytes=await readFile(source.path);if(bytes.byteLength>allowed.maxBytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Recurring competitive source bytes changed.');
  // Body-first receipt cannot be reset by a later A→B→A cache publication.
  const receipt=JSON.parse(await readFile(`data/provider_previews/objects/${source.sha256}.source.json`,'utf8'));
  if(receipt.sha256!==source.sha256||receipt.sourceUrl!==proof.sourceUrl||receipt.receivedAt!==proof.receivedAt)throw Error('Immutable body first-receipt disagrees with recurring proof.');
 }
}
export function existingLedgerSourcesAllowStage(ledgers:readonly {playerId:string;role:string;entries:readonly {stat:{provider:string;role:string}}[]}[],stage:CompetitiveGameStage){
 for(const ledger of ledgers){const record=stage.records.find(record=>record.normalized.kind==='STAT'&&record.entityKey.startsWith(`stat:${stage.game.id}:${ledger.playerId}:`));if(!record||record.normalized.kind!=='STAT'||ledger.role!==record.normalized.role||ledger.entries[0]&&(ledger.entries[0].stat.provider!==record.provider||ledger.entries[0].stat.role!==record.normalized.role))return false;}
 return true;
}
async function noProviderSwitch(tx:Prisma.TransactionClient,stage:CompetitiveGameStage){
 const ledgers=await tx.scoreLedger.findMany({where:{gameId:stage.game.id,preset:{version:recurringCompetitionPolicy.scoringPreset}},include:{entries:{orderBy:{sequence:'desc'},take:1,include:{stat:{select:{provider:true,role:true}}}}}});
 return existingLedgerSourcesAllowStage(ledgers,stage);
}
/** Independently leased per sport. Disabled authorization returns before any database access. */
export async function synchronizeRecurringCompetitionSport(sport:CompetitionSport,options:Options={}){
 if(options.testCollect||options.testAuthorization!==undefined)assertIsolatedIngestionDatabase();
 const authorization=await loadRecurringCompetitionAuthorization(options.testAuthorization),clock=options.clock??(()=>new Date()),at=clock();
 if(!authorization.success||authorization.data.policyFingerprint!==recurringCompetitionPolicyFingerprint)return{status:'DISABLED' as const,reason:'NO_EXACT_SEPARATE_COMPETITION_AUTHORIZATION'};
 const approvedAt=new Date(authorization.data.approvedAt);if(approvedAt<observedPolicyAdoptedAt||approvedAt>at||!Number.isFinite(+at))return{status:'DISABLED' as const,reason:'AUTHORIZATION_TIME_NOT_APPLICABLE'};
 if(options.testAuthorization===undefined&&!releaseRetrievalEnabled())return{status:'DISABLED' as const,reason:'LOCAL_AUTHORIZED_ENVIRONMENT_REQUIRED'};
 const db=options.db??getDatabase(),key=keyFor(sport),token=randomUUID();
 const claim=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${key.provider}:${sport}`},0))`;const state=await tx.professionalSyncState.upsert({where:{provider_sport_stream:key},create:{...key,nextPollAt:at},update:{}});if(state.nextPollAt>at||state.leaseUntil&&state.leaseUntil>at)return null;return tx.professionalSyncState.update({where:{id:state.id},data:{leaseToken:token,leaseUntil:new Date(+at+recurringCompetitionPolicy.leaseMs)}});});
 if(!claim)return{status:'WAITING' as const,sport};
 try{
  const collection=await(options.testCollect?options.testCollect(sport):collectReadOnlyCompetitiveStages(db,{sport,extendedNba:true,currentRegisteredSources:true}));
  if(collection.stages.length>recurringCompetitionPolicy.maxStagesPerSport)throw Error('Per-sport candidate bound exceeded.');
  const eligible=collection.stages.filter(stage=>stage.game.sport===sport&&!recurringCompetitionStageHold(stage,collection.proofs,approvedAt,clock())).sort((a,b)=>(a.game.scheduledStartsAt??'').localeCompare(b.game.scheduledStartsAt??'')||a.game.id.localeCompare(b.game.id));
  if(eligible.length)await verifySources(collection);
  return await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "ProfessionalSyncState" WHERE id=${claim.id}::uuid FOR UPDATE`;
   const owner=await tx.professionalSyncState.findUniqueOrThrow({where:{id:claim.id}});if(owner.leaseToken!==token||!owner.leaseUntil||owner.leaseUntil<=clock())throw Error('Recurring competition lease lost.');
   await lockSport(tx,sport);let processed=0,replay=0,held=collection.stages.length-eligible.length,lastGameId:string|null=null;
   for(const stage of eligible){
    const entityKey=`recurring-competitive-game:${recurringCompetitionPolicyFingerprint}:${stage.game.id}:${stage.sourceFingerprint}`;
    if(await tx.professionalDataObservation.findFirst({where:{provider:key.provider,sport,category:'RECURRING_COMPETITIVE_GAME',entityKey,decisions:{some:{outcome:'ACCEPTED'}}}})){replay++;continue;}
    if(!await noProviderSwitch(tx,stage)){held++;continue;}
    const players=stage.records.filter(row=>row.normalized.kind==='STAT').map(row=>/^stat:[^:]+:([^:]+):/.exec(row.entityKey)?.[1]??'');
    if(new Set(players).size!==stage.expectedSourcePlayers||await tx.player.count({where:{id:{in:players},sport,isSynthetic:false,isDemo:false}})!==players.length){held++;continue;}
    const manifest=await buildReviewedCompetitiveStages(tx,[stage],collection.sourceFiles,true),result=await applyCompetitiveStages(tx,manifest,{expectedFingerprint:fingerprint(manifest)},clock());
    if(result.completeBoxes!==1)throw Error('Recurring complete final box was not fully accepted.');
    const receipt={policyFingerprint:recurringCompetitionPolicyFingerprint,authorizationApprovedAt:approvedAt.toISOString(),gameId:stage.game.id,sourceFingerprint:stage.sourceFingerprint,manifestFingerprint:fingerprint(manifest),sourceBodyProofs:collection.proofs,processedAt:clock().toISOString()};
    await tx.professionalDataObservation.create({data:{provider:key.provider,sport,category:'RECURRING_COMPETITIVE_GAME',entityKey,revisionToken:stage.sourceFingerprint,revisionOrdinal:BigInt(+clock()),contentHash:fingerprint(receipt),sourceReference:'https://github.com/VickenMat/FantasySportsSite',observedAt:clock(),raw:receipt,normalized:{kind:'RECURRING_COMPETITIVE_GAME',gameId:stage.game.id},decisions:{create:{version:1,outcome:'ACCEPTED',reason:'Separately authorized prospective full final box; no provider switch, ownership or finalized-result writes.',targets:receipt,decidedAt:clock()}}}});
    processed++;lastGameId=stage.game.id;break;
   }
   const finished=clock();if(owner.leaseUntil<=finished)throw Error('Recurring competition lease expired; rollback.');
   await tx.professionalSyncState.update({where:{id:claim.id},data:{cursor:JSON.stringify({policyFingerprint:recurringCompetitionPolicyFingerprint,authorizationApprovedAt:approvedAt.toISOString(),processed,replay,held,lastGameId,processedAt:finished.toISOString()}),lastSuccessAt:finished,lastFailure:null,failures:0,leaseToken:null,leaseUntil:null,nextPollAt:new Date(+finished+recurringCompetitionPolicy.minIntervalMs)}});
   return{status:'PROCESSED' as const,sport,processed,replay,held,lastGameId};
  },{isolationLevel:'Serializable',timeout:recurringCompetitionPolicy.leaseMs});
 }catch(error){const now=clock(),nextPollAt=new Date(+now+retryDelay(claim.failures+1,recurringCompetitionPolicy.minIntervalMs,null));await db.professionalSyncState.updateMany({where:{id:claim.id,leaseToken:token},data:{leaseToken:null,leaseUntil:null,failures:{increment:1},lastFailure:'COMPETITIVE_SOURCE_OR_VALIDATION_FAILED',nextPollAt}});return{status:'BACKOFF' as const,sport,nextPollAt,reason:error instanceof Error?error.message:'COMPETITIVE_SOURCE_OR_VALIDATION_FAILED'};}
}
export async function processRecurringCompetition(options:Options={}){const results=await Promise.allSettled(competitionSports.map(sport=>synchronizeRecurringCompetitionSport(sport,options)));return{outcomes:results.map((result,index)=>result.status==='fulfilled'?result.value:{status:'BACKOFF' as const,sport:competitionSports[index],reason:'SPORT_CLAIM_OR_DATABASE_UNAVAILABLE'})};}
