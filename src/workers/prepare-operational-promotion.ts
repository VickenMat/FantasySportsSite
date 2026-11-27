/** Compose already reviewed component proposals; never regenerate approved A/B or write to PostgreSQL. */
import 'dotenv/config';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { fingerprint } from '@/ingestion/contracts';
import { validateOperationalPromotionSources } from '@/server/operational-data-promotion';
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const raw={version:'reviewed-operational-data-promotion-1',generic:await read('data/provider_previews/player_snapshot_review/reviewed_manifest.json'),nba:await read('data/position_enrichment/nba_observed_position_promotion_manifest.json'),calendar:await read('data/schedule_enrichment/announced_season_calendar_promotion.json'),competitive:await read('data/stat_enrichment/competitive_processing/reviewed_three_game_manifest.json')};
const batch=await validateOperationalPromotionSources(raw),targetFingerprint=fingerprint(batch);
const report={fingerprint:targetFingerprint,genericFingerprint:fingerprint(batch.generic),nbaFingerprint:fingerprint(batch.nba.manifest),calendarFingerprint:fingerprint(batch.calendar),competitiveFingerprint:fingerprint(batch.competitive),genericObservations:batch.generic.observations.length,nbaObservations:batch.nba.manifest.targets.length,calendarObservations:batch.calendar.observations.length,proposedSnapshotObservations:batch.generic.observations.length+batch.nba.manifest.targets.length+batch.calendar.observations.length,availabilityAppends:batch.generic.observations.filter(row=>row.normalized.kind==='PLAYER_SNAPSHOT'&&row.normalized.facet.type==='AVAILABILITY').length,rookieAppends:batch.generic.observations.filter(row=>row.normalized.kind==='PLAYER_SNAPSHOT'&&row.normalized.facet.type==='ROOKIE').length,developmentWrites:0,approvalRequired:true};
await mkdir('data/operational_enrichment',{recursive:true});
await writeFile('data/operational_enrichment/reviewed_manifest.json',JSON.stringify(batch,null,2)+'\n');
await writeFile('data/operational_enrichment/source_preview.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
