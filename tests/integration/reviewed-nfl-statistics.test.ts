import 'dotenv/config';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { normalizeHistoricalRow } from '@/imports/normalize';
import { fingerprint } from '@/ingestion/contracts';
import { reconcileReviewedNflStatistics } from '@/server/reviewed-nfl-statistics';
import { legacyPositionFallback } from '@/server/positions';
import { nflRow } from '../helpers/historical-csv';

const db=getDatabase();afterAll(()=>db.$disconnect());
it('adds only exact absent NFL rows on existing V5 participants, preserves timestamps and replays without ledger writes',async()=>{
 const marker=randomUUID(),year=2090,week=randomInt(1,19),gameExternalId=`${year}_${String(week).padStart(2,'0')}_BUF_BAL`;
 const player=await db.player.create({data:{sport:'NFL',displayName:`Isolated NFL stat ${marker}`,isDemo:false,isSynthetic:false}}),gsis=`00-${randomInt(1000000,9999999)}`;
 await db.playerExternalId.create({data:{sport:'NFL',provider:'v9-historical',externalId:gsis,playerId:player.id}});
 const season=await db.season.upsert({where:{sport_startYear:{sport:'NFL',startYear:year}},update:{},create:{sport:'NFL',startYear:year,label:String(year)}});
 const teams=await Promise.all(['BUF','BAL'].map(code=>db.proTeam.create({data:{sport:'NFL',provider:'schedule-v5',externalId:`${code}:${marker}`,code,displayName:`Isolated ${code}`}})));
 const game=await db.game.create({data:{sport:'NFL',seasonId:season.id,provider:'schedule-v5',externalId:gameExternalId,phase:'REGULAR',week,gameDate:new Date('2090-09-01'),startsAt:null,teams:{create:teams.map((team,index)=>({teamId:team.id,side:index?'HOME':'AWAY'}))}}});
 const sourceRecord={game_id:gameExternalId,season:String(year),week:String(week),home_team:'BAL',away_team:'BUF'};
 const scheduleBatch=await db.scheduleImportBatch.create({data:{importerVersion:'isolated',bundleHash:fingerprint(marker),status:'COMPLETE',sourceManifest:{synthetic:true}}});
 const observation=await db.gameScheduleObservation.create({data:{gameId:game.id,importBatchId:scheduleBatch.id,sport:'NFL',scheduleProvider:'schedule-v5',scheduleExternalId:gameExternalId,gameKey:`NFL:${gameExternalId}`,phase:'REGULAR',gameDate:game.gameDate!,status:'final',source:'synthetic-fixture',retrievedAt:new Date(),contentHash:fingerprint(sourceRecord),sourceRecord}});
 const raw={...nflRow,season:String(year),week:String(week),game_id:gameExternalId,player_id:gsis,player_display_name:player.displayName},normalized=normalizeHistoricalRow('NFL',raw,2);
 const headers=Object.keys(raw),csv=headers.join(',')+'\n'+headers.map(key=>JSON.stringify(raw[key as keyof typeof raw])).join(',')+'\n',sha=createHash('sha256').update(csv).digest('hex'),path=`data/provider_previews/objects/${sha}`;
 await mkdir('data/provider_previews/objects',{recursive:true});await writeFile(path,csv);
 try{
  const row={sourceLine:2,sourcePlayerId:gsis,sourceGameId:gameExternalId,playerId:player.id,gameId:game.id,teamId:teams[1].id,role:'FOOTBALL',newPlayerDependency:false,observedPositions:normalized.observedPositions,normalized:normalized.stats,raw,sourceKnownAt:null,existingCanonicalStatCount:0};
  const manifest={version:'nfl-v5-existing-game-stat-continuation-1',sourceProof:{sha256:sha},identityDependencyFingerprint:fingerprint(marker),gameBridges:[{sourceGameId:gameExternalId,canonicalGameId:game.id,provider:'schedule-v5',externalId:gameExternalId,seasonId:season.id,officialWeek:week,phase:'REGULAR',gameDate:game.gameDate!.toISOString(),startsAt:null,participants:teams.map((team,index)=>({teamId:team.id,provider:team.provider,externalId:team.externalId,code:team.code,side:index?'HOME':'AWAY'})).sort((a,b)=>a.side.localeCompare(b.side)),acceptedObservation:{id:observation.id,contentHash:observation.contentHash,sourceRecord},discovery:'EXISTING',actualStartClaim:false}],rows:[row]};
  expect(await reconcileReviewedNflStatistics(manifest)).toMatchObject({changes:1,applied:false});
  await expect(reconcileReviewedNflStatistics(manifest,{expectedFingerprint:'0'.repeat(64)})).rejects.toThrow(/changed/);
  const changedTeam={...manifest,rows:[{...row,teamId:teams[0].id}]};await expect(reconcileReviewedNflStatistics(changedTeam)).rejects.toThrow(/participant/);
  expect(await reconcileReviewedNflStatistics(manifest,{expectedFingerprint:fingerprint(manifest)})).toMatchObject({changes:1,applied:true});
  expect(await db.game.findUniqueOrThrow({where:{id:game.id}})).toEqual(game);
  expect(await db.playerGameStat.findFirstOrThrow({where:{gameId:game.id,playerId:player.id}})).toMatchObject({sourceKnownAt:null,observedPositions:['TE'],normalized:normalized.stats,raw:{reviewedNflStatistics:{historicalPositionsOnly:true}}});
  expect(legacyPositionFallback(await db.playerGameStat.findFirstOrThrow({where:{gameId:game.id,playerId:player.id}}))).toEqual([]);
  expect(await reconcileReviewedNflStatistics(manifest,{expectedFingerprint:fingerprint(manifest)})).toMatchObject({changes:0,alreadyApplied:1});
  expect(await db.scoreLedger.count({where:{playerId:player.id}})).toBe(0);expect(await db.playerPositionEvidence.count({where:{playerId:player.id}})).toBe(0);
  const different={...manifest,identityDependencyFingerprint:fingerprint('different-review')};await expect(reconcileReviewedNflStatistics(different)).rejects.toThrow(/no overwrite/);
 }finally{await rm(path,{force:true});}
});
