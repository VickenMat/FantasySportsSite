/** Read-only review: fills an adapter's historical-provider-only lookup gap using accepted V5 identities. */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { getDatabase } from '@/lib/db';
import { sourceProduct, type SourceRow } from '@/ingestion/open-data/read';
import { stableSourceProof } from '@/ingestion/open-data/provenance';
import { normalizeHistoricalRow } from '@/imports/normalize';
import { fingerprint } from '@/ingestion/contracts';
import { calculateScore } from '@/scoring/engine';
import { ubpV9Rules } from '@/scoring/ubp-v9';

const oldSha = 'b06ab83310fe351db1b16e89e87c074f7de464e51700f6b3ff730315598d0c12';
const expectedSourceSha = 'c5256b203f3c4de37222b95ec61a19b1e21b34f2496c8c5cd590146258f3fd36';
const db = getDatabase();
try {
  const product = await sourceProduct('nfl-statistics-2026');
  if(product.proof.sha256!==expectedSourceSha)throw Error('NFL source changed; prepare a separate reviewed batch rather than replacing this snapshot.');
  const oldBytes = await readFile(`data/provider_previews/objects/${oldSha}`);
  if (createHash('sha256').update(oldBytes).digest('hex') !== oldSha) throw Error('Baseline source changed.');
  const baseline = parse(oldBytes[0] === 31 && oldBytes[1] === 139 ? gunzipSync(oldBytes) : oldBytes, { columns: true, skip_empty_lines: true }) as SourceRow[];
  const roster = JSON.parse(await readFile('data/provider_previews/capability_review/nfl_roster_review.json', 'utf8')) as {
    targetFingerprint: string; candidates: {sourcePlayerId:string;proposedPlayerId:string;displayName:string}[];
  };
  const canonical = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [players, games] = await Promise.all([
      tx.playerExternalId.findMany({where:{provider:'v9-historical',sport:'NFL',player:{isSynthetic:false,isDemo:false}},select:{externalId:true,playerId:true}}),
      tx.game.findMany({where:{sport:'NFL',season:{startYear:2026}},include:{teams:{include:{team:true}},scheduleObservations:true}}),
    ]);
    const stats = await tx.playerGameStat.findMany({where:{gameId:{in:games.map(game=>game.id)},role:'FOOTBALL'},select:{gameId:true,playerId:true}});
    return {players,games,stats};
  },{isolationLevel:'RepeatableRead',timeout:120000});
  const playerMap = new Map(canonical.players.map(row=>[row.externalId,row.playerId]));
  const candidateMap = new Map(roster.candidates.map(row=>[row.sourcePlayerId,row]));
  const priorGames = new Map(canonical.games.filter(game=>game.provider==='v9-historical').map(game=>[game.externalId,game]));
  const existingStats = new Set(canonical.stats.map(row=>`${row.gameId}:${row.playerId}`));
  const supported = (row:SourceRow) => ['QB','RB','FB','WR','TE'].includes(row.position);
  const held = (rows:SourceRow[]) => rows.filter(row=>supported(row)).filter((row,index)=>{
    const normalized=normalizeHistoricalRow('NFL',row,index+2),game=priorGames.get(row.game_id);
    return !playerMap.has(row.player_id)||!game||!game.teams.some(team=>team.team.code===normalized.team.code);
  });
  const baselineHeld=held(baseline),latestHeld=held(product.rows);
  const bridges = new Map<string,unknown>(), heldRows:unknown[]=[], rows=[];
  for (const [index,row] of product.rows.entries()) {
    if(!latestHeld.includes(row))continue;
    const normalized=normalizeHistoricalRow('NFL',row,index+2);
    const playerId=playerMap.get(row.player_id)??candidateMap.get(row.player_id)?.proposedPlayerId;
    const matching=canonical.games.filter(game=>game.externalId===row.game_id&&game.week===normalized.game.week&&game.phase===normalized.game.phase&&game.teams.length===2&&game.teams.some(link=>link.side===normalized.team.side&&link.team.code===normalized.team.code)&&game.teams.some(link=>link.side===normalized.opponent?.side&&link.team.code===normalized.opponent?.code));
    if(!playerId||matching.length!==1){heldRows.push({sourceLine:index+2,sourcePlayerId:row.player_id,sourceGameId:row.game_id,reason:!playerId?'MISSING_PLAYER':'AMBIGUOUS_OR_MISSING_EXISTING_GAME'});continue;}
    const game=matching[0],team=game.teams.find(link=>link.team.code===normalized.team.code)!;
    const accepted=game.scheduleObservations.filter(observation=>observation.scheduleProvider==='schedule-v5'&&observation.scheduleExternalId===row.game_id&&observation.gameKey===`NFL:${row.game_id}`);
    if(game.provider!=='schedule-v5'||accepted.length!==1)throw Error(`Missing unique accepted V5 observation: ${row.game_id}`);
    if(existingStats.has(`${game.id}:${playerId}`)){heldRows.push({sourceLine:index+2,sourcePlayerId:row.player_id,sourceGameId:row.game_id,reason:'EXISTING_CANONICAL_STAT_NO_OVERWRITE'});continue;}
    const observation=accepted[0],record=observation.sourceRecord as Record<string,unknown>;
    const [, ,awayCode,homeCode]=row.game_id.split('_');
    if(record.game_id!==row.game_id||String(record.season)!==row.season||String(record.week)!==row.week||record.home_team!==homeCode||record.away_team!==awayCode)throw Error(`V5 tuple proof mismatch: ${row.game_id}`);
    bridges.set(game.id,{sourceGameId:row.game_id,canonicalGameId:game.id,provider:game.provider,externalId:game.externalId,seasonId:game.seasonId,officialWeek:game.week,phase:game.phase,gameDate:game.gameDate,startsAt:game.startsAt,participants:game.teams.map(link=>({teamId:link.teamId,provider:link.team.provider,externalId:link.team.externalId,code:link.team.code,side:link.side})).sort((a,b)=>a.side.localeCompare(b.side)),acceptedObservation:{id:observation.id,contentHash:observation.contentHash,sourceRecord:observation.sourceRecord},discovery:'EXISTING',actualStartClaim:false});
    const score=calculateScore(ubpV9Rules,{role:'FOOTBALL',stats:normalized.stats});
    rows.push({sourceLine:index+2,sourcePlayerId:row.player_id,sourceGameId:row.game_id,playerId,gameId:game.id,teamId:team.teamId,role:'FOOTBALL',newPlayerDependency:!playerMap.has(row.player_id),observedPositions:normalized.observedPositions,normalized:normalized.stats,raw:row,sourceKnownAt:null,scoreMissingStats:score.missingStats,existingCanonicalStatCount:0});
  }
  rows.sort((a,b)=>a.gameId.localeCompare(b.gameId)||a.playerId.localeCompare(b.playerId));
  if(new Set(rows.map(row=>`${row.gameId}:${row.playerId}:${row.role}`)).size!==rows.length)throw Error('Duplicate proposed canonical statistic.');
  const gameBridges=[...bridges.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const manifest={version:'nfl-v5-existing-game-stat-continuation-1',sourceProof:stableSourceProof(product.proof),baseline:{sha256:oldSha,rows:baseline.length,heldSupportedRows:baselineHeld.length},identityDependencyFingerprint:roster.targetFingerprint,gameBridges,rows};
  const report={baselineRows:baseline.length,currentRows:product.rows.length,baselineHeld:baselineHeld.length,currentHeld:latestHeld.length,missingLegacyGame:latestHeld.filter(row=>!priorGames.has(row.game_id)).length,missingPlayer:latestHeld.filter(row=>!playerMap.has(row.player_id)).length,proposedRows:rows.length,players:new Set(rows.map(row=>row.playerId)).size,existingV5Games:bridges.size,newPlayerDependencies:[...new Set(rows.filter(row=>row.newPlayerDependency).map(row=>row.sourcePlayerId))],rowsWithMissingScoringStats:rows.filter(row=>row.scoreMissingStats.length).length,heldRows,sourceSha256:product.proof.sha256,targetFingerprint:fingerprint(JSON.parse(JSON.stringify(manifest))),developmentWrites:0,currentEligibilityChanges:0,gameTimeChanges:0};
  await writeFile('data/stat_enrichment/nfl_v5_stat_continuation_manifest.json',JSON.stringify(manifest,null,2)+'\n');
  await writeFile('data/stat_enrichment/nfl_v5_stat_continuation_report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await db.$disconnect(); }
