import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {enrichNhlHistoricalSeason,type NhlHistoricalProof} from '@/simulation/nhl-enrichment';
import type {SourceRow} from '@/ingestion/open-data/read';
const years=(process.argv.find(value=>value.startsWith('--seasons='))?.split('=')[1]??'2017').split(',').map(Number);
if(years.length>11||years.some(year=>!Number.isInteger(year)||year<2017||year>2027))throw Error('Explicit historical seasonal end years2017–2027 required.');
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
for(const year of years){
 if(!process.argv.includes('--verify-only')){const decoded=spawnSync('python3',['scripts/decode-m6-nhl-season.py',String(year)],{encoding:'utf8',maxBuffer:1024*1024});if(decoded.status!==0)throw Error(decoded.stderr||'Historical NHL decode failed.');}
 const directory=`data/simulation/nhl_enrichment/${year-1}`,sources=JSON.parse(await readFile(`${directory}/source_profiles.json`,'utf8')) as {profiles:NhlHistoricalProof[]};
 const rows=new Map<string,SourceRow[]>();for(const profile of sources.profiles){const body=await readFile(profile.decodedPath);if(sha(body)!==profile.decodedSha256)throw Error('Decoded historical source changed.');rows.set(profile.kind,body.toString().split('\n').filter(Boolean).map(line=>JSON.parse(line) as SourceRow));}
 const result=enrichNhlHistoricalSeason({seasonStartYear:year-1,profiles:sources.profiles,skaters:rows.get('skaters')!,goalies:rows.get('goalies')!,info:rows.get('info')!,scoring:rows.get('scoring')!,events:rows.get('events')!});
 const body=Buffer.from(result.overlays.map(row=>JSON.stringify(row)).join('\n')+'\n');
 if(process.argv.includes('--verify-only')){const previous=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));if(previous.overlaySha256!==sha(body)||previous.overlayFingerprint!==result.report.overlayFingerprint||JSON.stringify(previous.metrics)!==JSON.stringify(result.report.metrics))throw Error('Historical enrichment replay is not byte deterministic.');console.log(JSON.stringify({seasonStartYear:year-1,reproducedByteIdentical:true,overlaySha256:sha(body)}));continue;}
 await mkdir(directory,{recursive:true});await writeFile(`${directory}/overlay.jsonl`,body);
 const manifest={...result.report,sourceFiles:sources.profiles,overlayPath:`${directory}/overlay.jsonl`,overlayBytes:body.length,overlaySha256:sha(body),overlayRows:result.overlays.length,canonicalPlayerCount:new Set(result.overlays.map(row=>row.sourcePlayerId)).size,canonicalGameCount:new Set(result.overlays.map(row=>row.sourceGameId)).size,databaseWrites:0,originalArchiveWrites:0,currentEligibilityChanges:0,activeV9Changes:0};
 await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({seasonStartYear:year-1,metrics:result.report.metrics,overlayRows:manifest.overlayRows,overlaySha256:manifest.overlaySha256,faceoffConflictGames:result.report.faceoffConflicts.length,scoringConflictGames:result.report.scoringConflicts.length}));
}
