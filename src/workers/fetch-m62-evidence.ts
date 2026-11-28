/** Bounded historical open-data evidence only; no registry or database writes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {retrieveRelease} from '@/ingestion/open-data/storage';
import {releaseRegistry,type ReleaseProduct} from '@/ingestion/open-data/registry';
const root='data/simulation/evidence_closure_v1';await mkdir(root+'/catalogs',{recursive:true});
const plans=[
 {repo:'sportsdataverse/sportsdataverse-data',tag:'nba_crosswalk',sport:'NBA',names:['nba_player_crosswalk_2024.parquet'],template:'nba-boxscores-2027'},
 {repo:'nflverse/nflverse-data',tag:'weekly_rosters',sport:'NFL',names:['roster_weekly_2023.parquet'],template:'nfl-rosters-2026'},
 {repo:'nflverse/nflverse-data',tag:'snap_counts',sport:'NFL',names:['snap_counts_2023.parquet'],template:'nfl-statistics-2026'},
 {repo:'nflverse/nflverse-data',tag:'pbp',sport:'NFL',names:['play_by_play_2023.parquet'],template:'nfl-statistics-2026'},
 {repo:'sportsdataverse/sportsdataverse-data',tag:'nba_stats_schedules',sport:'NBA',names:['nba_schedule_2024.csv.gz','nba_schedule_2024.parquet'],template:'nba-schedule-results-2027'},
 {repo:'sportsdataverse/sportsdataverse-data',tag:'espn_nba_game_rosters',sport:'NBA',names:['game_rosters_2024.parquet','nba_game_rosters_2024.parquet'],template:'nba-boxscores-2027'},
 {repo:'sportsdataverse/sportsdataverse-data',tag:'espn_nba_player_boxscores',sport:'NBA',names:['player_box_2024.parquet','nba_player_box_2024.parquet'],template:'nba-boxscores-2027'},
 {repo:'sportsdataverse/sportsdataverse-data',tag:'espn_nba_pbp',sport:'NBA',names:['play_by_play_2024.parquet','nba_pbp_2024.parquet'],template:'nba-boxscores-2027'},
 {repo:'sportsdataverse/sportsdataverse-data',tag:'mlb_pbp',sport:'MLB',names:['mlb_pbp_2023.csv.gz'],template:'mlb-plays-2026'},
];
const results=[];let requests=0,bytes=0;
const budget=async()=>{if(++requests>40)throw Error('Historical request cap40 reached.');await delay(3000);};
for(const plan of plans){
 const catalogPath=root+'/catalogs/'+plan.tag+'.json';let catalog;
 try{catalog=JSON.parse(await readFile(catalogPath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await budget();const response=await fetch(`https://api.github.com/repos/${plan.repo}/releases/tags/${plan.tag}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'FantasyEvolution-HistoricalEvidence'},signal:AbortSignal.timeout(30000)});if(!response.ok){results.push({tag:plan.tag,status:'CATALOG_UNAVAILABLE',httpStatus:response.status});continue;}const body=await response.text();if(body.length>4*1024*1024)throw Error('Catalog too large');catalog=JSON.parse(body);await writeFile(catalogPath,body);}
 const asset=plan.names.map(name=>catalog.assets.find((a:{name:string})=>a.name===name)).find(Boolean);
 if(!asset){results.push({tag:plan.tag,status:'NO_EXACT_SEASON_ASSET',availableNames:catalog.assets.filter((a:{name:string})=>a.name.includes('2024')||a.name.includes('2023')).map((a:{name:string})=>a.name)});continue;}
 if(asset.size>80*1024*1024||bytes+asset.size>160*1024*1024){results.push({tag:plan.tag,status:'BYTE_BUDGET_EXCLUDED',bytes:asset.size});continue;}bytes+=asset.size;
 const template=releaseRegistry.find(p=>p.id===plan.template)??releaseRegistry.find(p=>p.id===(plan.repo.startsWith('nflverse')?'nfl-rosters-2026':'nba-boxscores-2027'));if(!template)throw Error('Existing licensed family required '+plan.template);
 const product={...template,sport:plan.sport,id:'m62-'+plan.tag,directory:'m62-evidence',filename:asset.name,sourceUrl:asset.browser_download_url,maxBytes:Math.min(80*1024*1024,asset.size+1048576)};
 let cached=false;try{await readFile('data/provider_previews/'+product.directory+'/'+product.filename.replace(/\.csv(?:\.gz)?$/,'')+'.source.json');cached=true;}catch{}
 const response=await retrieveRelease(product as ReleaseProduct,{cacheOnly:cached,beforeRequest:budget});results.push({tag:plan.tag,status:response.status,path:'data/provider_previews/objects/'+response.metadata.sha256,sourceUrl:product.sourceUrl,license:product.license,licenseReference:product.licenseReference,sha256:response.metadata.sha256,bytes:response.bytes.byteLength,catalogSha256:createHash('sha256').update(await readFile(catalogPath)).digest('hex'),receivedAt:response.metadata.receivedAt});console.log(JSON.stringify({tag:plan.tag,status:response.status,bytes:response.bytes.byteLength}));
}
await writeFile(root+'/acquisition.json',JSON.stringify({version:'m62-targeted-2023-open-evidence-1',requests,plannedBytes:bytes,results,productionWrites:0,registryChanges:0,subscriptions:0},null,2)+'\n');
