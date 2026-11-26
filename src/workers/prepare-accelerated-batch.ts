import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { sourceProduct } from '@/ingestion/open-data/read';
import { bodyHash, preserveObject } from '@/ingestion/open-data/storage';
import { buildReviewedNbaRosterManifest } from '@/server/reviewed-roster-discovery';
import { buildReviewedNflRosterManifest } from '@/server/reviewed-nfl-roster';
import { reconcileAcceleratedBatch } from '@/server/accelerated-data-batch';
import { getDatabase } from '@/lib/db';
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
try{
 const nba=await sourceProduct('nba-rosters-2027'),espn=await sourceProduct('nba-listed-2027'),candidates=await json('data/provider_previews/capability_review/nba_discovery_manifest.json'),bridges=await json('data/provider_previews/capability_review/nba_identity_bridges.json');
 if(candidates.sourceSha256!==nba.proof.sha256||bridges.officialCurrentSha256!==nba.proof.sha256)throw Error('Reviewed NBA source version changed.');
 const sourceProofs=[nba,espn].map(source=>({sourceReference:source.source.sourceUrl,sha256:source.proof.sha256}));
 for(const file of ['nba_player_crosswalk_2027.csv','nba_rosters_2026.csv','nba_team_crosswalk_2027.csv']){
  const path=`data/provider_previews/capability_review/${file}`,metadata=await json(path+'.source.json'),bytes=await readFile(path);
  if(bodyHash(bytes)!==metadata.sha256)throw Error('Corroborating NBA source changed.');
  await preserveObject('data/provider_previews',bytes);sourceProofs.push({sourceReference:metadata.url,sha256:metadata.sha256});
 }
 const reviewer=await getDatabase().user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL},select:{id:true}});
 const nflSource=await sourceProduct('nfl-rosters-2026');
 const nflReport=await json('data/provider_previews/capability_review/nfl_roster_review.json'),nflStatistics=await json('data/stat_enrichment/nfl_v5_stat_continuation_manifest.json');
 if(nflStatistics.identityDependencyFingerprint!==nflReport.targetFingerprint)throw Error('NFL statistical dependency review changed.');
 const batch={version:'m5-accelerated-reviewed-batch-1',nflStatistics,nhl:await json('data/stat_enrichment/nhl_accelerated_missing_manifest.json'),mlb:await json('data/stat_enrichment/mlb_accelerated_role_manifest.json'),nba:buildReviewedNbaRosterManifest(candidates,bridges,sourceProofs,reviewer.id),nfl:buildReviewedNflRosterManifest(nflReport,[{sourceReference:nflSource.source.sourceUrl,sha256:nflSource.proof.sha256}],reviewer.id)};
 const dry=await reconcileAcceleratedBatch(batch);
 await writeFile('data/stat_enrichment/m5_accelerated_batch.json',JSON.stringify(batch,null,2)+'\n');await writeFile('data/stat_enrichment/m5_accelerated_batch_preview.json',JSON.stringify(dry,null,2)+'\n');console.log(JSON.stringify(dry,null,2));
}finally{await getDatabase().$disconnect();}
