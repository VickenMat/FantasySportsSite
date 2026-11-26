import { writeFile } from 'node:fs/promises';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { openDataSources } from '@/ingestion/open-data/sources';
import { sourceProduct } from '@/ingestion/open-data/read';

const products=[];
for(const source of openDataSources.filter(source=>source.id.includes('injuries'))){
 const product=await sourceProduct(source.id),rows=await parquetReadObjects({file:await asyncBufferFromFile(product.path),compressors:{GZIP:(bytes,size)=>gunzipSync(bytes,{maxOutputLength:Math.max(1,size)}),ZSTD:(bytes,size)=>zstdDecompressSync(bytes,{maxOutputLength:Math.max(1,size)})}});
 const date=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10),dates=[...new Set(rows.map(row=>date(row.as_of_date)))].sort(),latestDate=dates.at(-1)!;
 const latest=rows.filter(row=>date(row.as_of_date)===latestDate).map(row=>({sourcePlayerId:String(row.athlete_id),sourceInjuryId:String(row.injury_id),displayName:String(row.athlete_display_name),sourceTeamId:String(row.team_id),sourceStatus:String(row.status),sourceType:String(row.type_name),sourceFantasyStatus:row.detail_fantasy_status??null,sourceReportedSnapshotDate:latestDate,snapshotPrecision:'DAY',sourceRecordTimestamp:row.injury_date??null,sourceRecordTimestampSemantics:'UNVERIFIED_EDITORIAL_OR_INJURY_RECORD_TIME',sourceReturnDate:row.detail_return_date??null,effectiveAt:null,officialPublishedAt:null}));
 const statuses=Object.fromEntries([...new Set(latest.map(row=>row.sourceStatus))].sort().map(status=>[status,latest.filter(row=>row.sourceStatus===status).length]));
 products.push({id:source.id,sport:source.sport,sourceReference:source.sourceUrl,sha256:product.proof.sha256,artifactModifiedAt:product.proof.artifactModifiedAt,receivedAt:product.proof.receivedAt,totalRows:rows.length,snapshotDates:dates.length,firstSnapshotDate:dates[0],latestSnapshotDate:latestDate,latestRows:latest.length,latestUniqueAthletes:new Set(latest.map(row=>row.sourcePlayerId)).size,statuses,rows:latest,canonicalPromotionApplied:false,currentIrEligibilityChanges:0});
}
await writeFile('data/provider_previews/capability_review/latest_injury_evidence.json',JSON.stringify({products,networkRequests:0,developmentWrites:0},null,2)+'\n');
console.log(JSON.stringify(products.map(({rows,...summary})=>{void rows;return summary;}),null,2));
