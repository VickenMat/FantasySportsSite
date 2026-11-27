import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {retrieveRelease} from '@/ingestion/open-data/storage';
import {releaseRegistry,type ReleaseProduct} from '@/ingestion/open-data/registry';
const requested=process.argv.find(value=>value.startsWith('--seasons='))?.split('=')[1]??'2017';
const years=requested.split(',').map(Number);
if(years.length>11||new Set(years).size!==years.length||years.some(year=>!Number.isInteger(year)||year<2017||year>2027))throw Error('Use at most11 explicit seasonal end years2017–2027.');
const kinds=[['skaters','nhl_skater_boxscores','skater_box'],['goalies','nhl_goalie_boxscores','goalie_box'],['info','nhl_game_info','game_info'],['scoring','nhl_scoring','scoring'],['events','nhl_pbp_lite','play_by_play_lite']] as const;
const root='data/provider_previews',output='data/simulation/nhl_enrichment';await mkdir(output,{recursive:true});
let requests=0,plannedBytes=0;const reports=[];
const ledgerPath=`${output}/request-budget.json`;
let ledger:{version:string;timestamps:number[];priorSafetyReservation:number};
try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const receipts=await readdir(`${root}/m6-nhl`,{recursive:true}),knownTimes=await Promise.all(receipts.filter(path=>path.endsWith('.source.json')).map(async path=>Date.parse(JSON.parse(await readFile(`${root}/m6-nhl/${path}`,'utf8')).lastVerifiedAt)));const latest=Math.max(0,...knownTimes);ledger={version:'m6-nhl-request-budget-1',timestamps:Array(70).fill(latest) as number[],priorSafetyReservation:70};await writeFile(ledgerPath,JSON.stringify(ledger,null,2)+'\n');}
const budget=async()=>{
 if(requests>=120)throw Error('Bounded per-run request budget exhausted.');
 const now=Date.now(),last=ledger.timestamps.at(-1)??0;await delay(Math.max(0,3000-(now-last)));
 const at=Date.now();ledger.timestamps=ledger.timestamps.filter(time=>time>at-3600000);
 if(ledger.timestamps.length>=600||ledger.timestamps.filter(time=>time>at-60000).length>=60)throw Error('Historical rolling request budget exhausted; resume from cache in a later window.');
 ledger.timestamps.push(at);requests++;await writeFile(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
};
for(const year of years)for(const[kind,release,prefix]of kinds){
 const catalog=JSON.parse(await readFile(`${root}/sportsdataverse/${release}.release.json`,'utf8')) as {assets:{name:string;size:number;browser_download_url:string}[]};
 const name=`${prefix}_${year}.parquet`,asset=catalog.assets.find(row=>row.name===name);
 if(!asset){reports.push({year,kind,status:'PUBLISHED_SEASONAL_PRODUCT_ABSENT',catalog:`${release}.release.json`,name});continue;}
 plannedBytes+=asset.size;if(plannedBytes>300*1024*1024)throw Error('Bounded historical acquisition byte budget exceeded.');
 const template=releaseRegistry.find(source=>source.id===`nhl-${kind==='info'?'game-info':kind}-2027`)!;
 if(!template)throw Error('Reuse a licensed existing NHL product family.');
 const product={...template,id:`m6-nhl-${kind}-${year}`,directory:`m6-nhl/${year}`,filename:name,sourceUrl:asset.browser_download_url,maxBytes:Math.min(64*1024*1024,asset.size+1024*1024)};
 const localPath=`${root}/${product.directory}/${name}`,metadataPath=localPath.replace(/\.csv(?:\.gz)?$/,'')+'.source.json';
 let cached=false;try{await readFile(metadataPath);cached=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const result=await retrieveRelease(product as ReleaseProduct,{cacheOnly:cached,beforeRequest:budget});
 const report={year,kind,status:result.status,id:product.id,path:`${root}/objects/${result.metadata.sha256}`,sourceUrl:product.sourceUrl,license:product.license,licenseReference:product.licenseReference,sha256:result.metadata.sha256,bytes:result.bytes.byteLength,receivedAt:result.metadata.receivedAt,sourceKnownAt:null,catalogAssetBytes:asset.size};reports.push(report);console.log(JSON.stringify(report));
}
await writeFile(`${output}/acquisition-${years.join('-')}.json`,JSON.stringify({version:'m6-nhl-seasonal-acquisition-1',seasons:years,requestLimit:120,rollingMinuteLimit:60,totalRequests:requests,plannedBytes,databaseWrites:0,operationalRegistryChanges:0,reports},null,2)+'\n');
