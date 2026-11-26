import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { fingerprint } from '@/ingestion/contracts';
import { calculateScore, type StatValues } from '@/scoring/engine';
import { scoringCompleteness } from '@/scoring/completeness';
import { ubpV9Rules } from '@/scoring/ubp-v9';
import { historicalStatsForScoring } from '@/scoring/historical-evidence';
import { participationEvidence } from '@/scoring/participation';
import { recalculateScore } from '@/server/score-ledger';
import { playerStatistics } from '@/server/player-statistics';

assertIsolatedIngestionDatabase();
const schema=new URL(process.env.DATABASE_URL!).searchParams.get('schema')!,client=new pg.Client({connectionString:process.env.DATABASE_URL}),db=getDatabase();
const q=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const original=(raw:unknown):Record<string,unknown>=>{let value=raw;for(let depth=0;depth<10&&value&&typeof value==='object'&&'original'in value;depth++)value=value.original;return(value&&typeof value==='object'?value:{}) as Record<string,unknown>;};
await client.connect();await client.query(`SET search_path TO ${q(schema)}`);
try{
 const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows.map((row:{tablename:string})=>row.tablename);
 const idTables=new Set<string>((await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema=$1 AND column_name='id'",[schema])).rows.map(row=>row.table_name));
 const snapshot=async(table:string,oldOnly=false)=>(await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${q(table)} t ${oldOnly&&idTables.has(table)?`WHERE to_jsonb(t)->>'id' IN(SELECT id FROM ${q('four_sport_baseline_'+table)})`:''}`)).rows[0] as {count:string;fingerprint:string};
 const before=new Map<string,Awaited<ReturnType<typeof snapshot>>>();
 for(const table of tables){if(idTables.has(table))await client.query(`CREATE TEMP TABLE ${q('four_sport_baseline_'+table)} AS SELECT to_jsonb(t)->>'id' AS id FROM ${q(table)} t`);before.set(table,await snapshot(table));}
 const preset=await db.scoringPreset.findUniqueOrThrow({where:{version:'ubp-v9-experimental'},include:{rules:true}});
 const rules=preset.rules.map(rule=>({sport:rule.sport,statKey:rule.statKey,applicability:rule.applicability,coefficientTenths:Number(rule.coefficient.mul(10).toFixed(0))}));
 const canonicalRules=(input:typeof rules)=>[...input].sort((a,b)=>`${a.sport}:${a.statKey}:${a.applicability}`.localeCompare(`${b.sport}:${b.statKey}:${b.applicability}`));
 if(fingerprint(canonicalRules(rules))!==fingerprint(canonicalRules([...ubpV9Rules])))throw Error('Stored V9 weights differ from the accepted code definition.');
 if(rules.length!==56)throw Error('Expected all 56 preserved UBP V9 weights.');
 const batch=JSON.parse(await readFile('data/stat_enrichment/m5_accelerated_batch.json','utf8'));
 const nhlFingerprint=fingerprint(batch.nhl),nflFingerprint=fingerprint(batch.nflStatistics);
 const newStatIds=(await client.query(`SELECT id FROM "PlayerGameStat" WHERE raw->'historicalStatEnrichment'->>'targetFingerprint'=$1 OR raw->'reviewedNflStatistics'->>'targetFingerprint'=$2`,[nhlFingerprint,nflFingerprint])).rows.map((row:{id:string})=>row.id);
 const newRoleLedgerIds=(await client.query(`SELECT DISTINCT "ledgerId" AS id FROM "ScoreLedgerEntry" WHERE reason LIKE $1`,[`%manifest ${batch.mlb.report.targetFingerprint}%`])).rows.map((row:{id:string})=>row.id);
 const baselineArchivePlayers=new Set<string>(),currentArchivePlayers=new Set<string>();
 const inputCoverage=[];
 for(const sport of ['NFL','MLB','NBA','NHL'] as const){
  const values=[];
  for(const afterBatch of [false,true]){
   const rows=await db.playerGameStat.findMany({where:{provider:'v9-historical',game:{sport,season:{startYear:2026}},player:{isDemo:false,isSynthetic:false},...(!afterBatch&&newStatIds.length?{id:{notIn:newStatIds}}:{})},distinct:['playerId','gameId','role'],orderBy:[{revision:'desc'},{recordedAt:'desc'}],select:{playerId:true,gameId:true,role:true,normalized:true,observedPositions:true,provider:true,raw:true}});
   for(const row of rows)(afterBatch?currentArchivePlayers:baselineArchivePlayers).add(row.playerId);
   const ledgers=await db.scoreLedger.findMany({where:{presetId:preset.id,game:{sport,season:{startYear:2026}},...(!afterBatch&&newRoleLedgerIds.length?{id:{notIn:newRoleLedgerIds}}:{})},select:{playerId:true,gameId:true,role:true}});
   const appearances=rows.map(row=>({...row,normalized:historicalStatsForScoring({...row,normalized:row.normalized as StatValues})}));
   const coverage=scoringCompleteness(appearances,rules,new Map(ledgers.map(row=>[`${row.playerId}:${row.gameId}`,row.role])));
   values.push({...coverage,completePlayers:coverage.players-coverage.affectedPlayers,completeAppearances:coverage.appearances-coverage.affectedAppearances});
  }
  inputCoverage.push({sport,beforeReviewedBatch:values[0],afterReviewedBatch:values[1]});
 }
 const newIdentityIds=[...batch.nba.candidates,...batch.nfl.candidates].map((row:{proposedPlayerId:string})=>row.proposedPlayerId);
 const materializedNewIdentityCount=await db.player.count({where:{id:{in:newIdentityIds}}});
 const newIdentitiesWithStatistics=newIdentityIds.filter((id:string)=>currentArchivePlayers.has(id)).length;
 const populationScope={baselineAcceptedArchivePlayers:baselineArchivePlayers.size,currentArchivePlayers:currentArchivePlayers.size,reviewedNewIdentityTargets:newIdentityIds.length,materializedNewIdentities:materializedNewIdentityCount,newIdentitiesWithHistoricalStatistics:newIdentitiesWithStatistics,materializedRosterOnlyIdentities:materializedNewIdentityCount-newIdentitiesWithStatistics,baselineReconstruction:'Exact reviewed NHL/NFL appended stat tags and new reviewed MLB role ledgers excluded; originals remain unchanged'};
 const sportReports=[];
 for(const sport of ['NFL','MLB','NBA','NHL'] as const){
  // Latest accepted historical roles first; a second role excludes the pair.
  // This avoids choosing an MLB role because its realized points look favorable.
  const candidateIds=(await client.query(`WITH latest AS(
   SELECT DISTINCT ON(s."gameId",s."playerId",s.role) s.id,s."gameId",s."playerId",s.role
   FROM "PlayerGameStat" s JOIN "Game" g ON g.id=s."gameId" JOIN "Season" y ON y.id=g."seasonId" JOIN "Player" p ON p.id=s."playerId"
   WHERE s.provider='v9-historical' AND g.sport=$1 AND y."startYear"=2026 AND NOT p."isSynthetic" AND NOT p."isDemo"
   ORDER BY s."gameId",s."playerId",s.role,s.revision DESC,s."recordedAt" DESC
  ),single_role AS(SELECT *,count(*) OVER(PARTITION BY "gameId","playerId") AS roles FROM latest)
  SELECT s.id FROM single_role s WHERE s.roles=1 AND NOT EXISTS(SELECT 1 FROM "ScoreLedger" l WHERE l."gameId"=s."gameId" AND l."playerId"=s."playerId" AND l."presetId"=$2) ORDER BY s."gameId",s."playerId" LIMIT 5000`,[sport,preset.id])).rows.map((row:{id:string})=>row.id);
  const candidates=await db.playerGameStat.findMany({where:{id:{in:candidateIds}},include:{game:{select:{seasonId:true,externalId:true,startsAt:true,gameDate:true}},player:{select:{displayName:true}}}});
  const priority=new Map(candidateIds.map((id:string,index:number)=>[id,index]));candidates.sort((a,b)=>priority.get(a.id)!-priority.get(b.id)!);
  const selected=[];const players=new Set<string>();
  for(const stat of candidates){
   if(players.has(stat.playerId))continue;
   const stats=historicalStatsForScoring({...stat,normalized:stat.normalized as StatValues});
   if(sport==='NFL'&&(original(stat.raw).position!=='QB'||stats.receptions!==0))continue;
   const direct=calculateScore(rules,{role:stat.role,stats,teEligible:stat.role==='FOOTBALL'&&stat.observedPositions.length?stat.observedPositions.includes('TE'):null});
   if(direct.missingStats.length||participationEvidence({...stat,normalized:stats}).status!=='PLAYED')continue;
   selected.push({stat,direct});players.add(stat.playerId);if(selected.length===25)break;
  }
  if(selected.length!==25)throw Error(`${sport} has only ${selected.length} independently complete played targets in the bounded source sample; no synthetic values substituted.`);
  const targets=[];let replayChanges=0;
  for(const{stat,direct}of selected){
   const input={gameId:stat.gameId,playerId:stat.playerId,role:stat.role,sourceProvider:'v9-historical',reason:'Disposable real historical four-sport source-to-V9-to-website acceptance; no competitive finalization'};
   const scored=await recalculateScore(input);
   if(!scored.ledger||!scored.changed||scored.entry.statId!==stat.id||scored.entry.missingStats.length||scored.entry.totalTenths!==BigInt(direct.totalTenths)||scored.ledger.role!==stat.role)throw Error(`${sport} direct V9 result differs from its exact historical ledger.`);
   if((await recalculateScore(input)).changed)replayChanges++;
   const analytics=await playerStatistics({playerIds:[stat.playerId],seasonId:stat.game.seasonId,presetId:preset.id});
   const website=analytics.get(stat.playerId);
   if(!website||website.scoredGames<1)throw Error(`${sport} scored historical appearance is absent from website analytics.`);
   targets.push({playerId:stat.playerId,playerName:stat.player.displayName,gameId:stat.gameId,sourceGameId:stat.game.externalId,seasonId:stat.game.seasonId,statId:stat.id,contentHash:stat.contentHash,role:stat.role,directV9Tenths:direct.totalTenths,ledgerId:scored.ledger.id,entryId:scored.entry.id,sourceKnownAt:stat.sourceKnownAt,website:{...website,totalTenths:website.totalTenths?.toString()??null},websiteAggregateMayRemainUnknownWhenOtherGamesLackEvidence:true});
  }
  if(replayChanges)throw Error(`${sport} historical replay added duplicate scores.`);
  sportReports.push({sport,realAcceptedHistoricalAppearances:25,distinctPlayers:25,singleRolePairsOnly:true,nflScope:sport==='NFL'?'QB with zero receptions; no TE eligibility override':null,completeDirectV9Matches:25,newGlobalLedgers:25,newGlobalEntries:25,replayChanges,websiteAnalyticsPlayers:25,targets});
 }
 const after=new Map<string,Awaited<ReturnType<typeof snapshot>>>();
 for(const table of tables){const current=await snapshot(table,true);if(JSON.stringify(current)!==JSON.stringify(before.get(table)))throw Error(`Original row altered by historical acceptance: ${table}`);const full=await snapshot(table);after.set(table,full);const expected=table==='ScoreLedger'||table==='ScoreLedgerEntry'?100:0;if(Number(full.count)-Number(before.get(table)!.count)!==expected)throw Error(`Unexpected historical acceptance writes: ${table}`);}
 // Website reads are also part of the immutability proof above; no ownership,
 // lineup, lifecycle, publication or professional-game timestamp rows may change.
 const report={schema,targetDatabase:'fantasy_evolution_test',developmentWrites:0,scope:'REAL_ACCEPTED_HISTORICAL_SOURCE_TO_GLOBAL_V9_LEDGER_TO_WEBSITE_ANALYTICS',competitiveAcceptance:'FIXTURE_BACKED_MECHANISMS_ONLY; live source permissions, completion/publication timestamps, immutable competitive lineup snapshots and finalization gates remain separate',liveFeedActivated:false,competitiveResultsFinalized:false,syntheticStatSubstitutions:0,presetVersion:preset.version,weights:rules.length,inputCoverage,populationScope,weightFingerprint:fingerprint(rules),originalTablesPreserved:tables.length,originalRowsUnchanged:true,newGlobalLedgers:100,newGlobalEntries:100,allOtherTableCountsUnchanged:true,replayChanges:0,sports:sportReports};
 await writeFile('data/stat_enrichment/m5_four_sport_historical_validation.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,sports:sportReports.map(({targets,...summary})=>({...summary,targetFingerprint:fingerprint(targets)}))}));
}finally{await client.end();await db.$disconnect();}
