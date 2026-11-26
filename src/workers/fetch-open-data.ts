import{mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{openDataSources,openDataAttribution}from'@/ingestion/open-data/sources';
import{fetchPublicData,type HttpCache}from'@/ingestion/http';
const refresh=process.argv.includes('--refresh');const reports=[];
const objectDirectory='data/provider_previews/objects';await mkdir(objectDirectory,{recursive:true});
async function preserveObject(body:Uint8Array){const hash=createHash('sha256').update(body).digest('hex'),path=`${objectDirectory}/${hash}`;try{await writeFile(path,body,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const existing=await readFile(path);if(createHash('sha256').update(existing).digest('hex')!==hash)throw Error('Immutable source object was altered.');}}
for(const source of openDataSources){
 const directory=`data/provider_previews/${source.directory}`;await mkdir(directory,{recursive:true});
 const path=`${directory}/${source.filename}`,metadataPath=`${directory}/${source.filename.replace(/\.csv(?:\.gz)?$/,'')}.source.json`;
 let cache:HttpCache|undefined,prior:Record<string,unknown>|undefined;
 try{prior=JSON.parse(await readFile(metadataPath,'utf8'));const body=await readFile(path);if(prior?.sourceUrl!==source.sourceUrl||createHash('sha256').update(body).digest('hex')!==prior.sha256)throw Error('Source cache fingerprint changed.');cache={sourceUrl:source.sourceUrl,body,etag:prior.etag as string|null,lastModified:prior.lastModified as string|null,fetchedAt:prior.receivedAt as string};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(cache&&!refresh){await preserveObject(cache.body);const corrected={...prior,license:source.license,licenseReference:source.licenseReference,attribution:openDataAttribution};await writeFile(metadataPath,JSON.stringify(corrected,null,2)+'\n');reports.push({...corrected,id:source.id,status:'VERIFIED_LOCAL_SOURCE',newRequests:0});continue;}
 const response=await fetchPublicData({sourceUrl:source.sourceUrl,allowedHosts:['github.com','release-assets.githubusercontent.com'],maxBytes:source.maxBytes,timeoutMs:60000,permission:'OPEN_DATA_PREVIEW'},cache);
 if(response.status==='PENDING_PERMISSION')throw Error('Open release disabled.');
 const report={id:source.id,provider:source.provider,sport:source.sport,sourceUrl:source.sourceUrl,license:source.license,licenseReference:source.licenseReference,attribution:openDataAttribution,sha256:createHash('sha256').update(response.cache.body).digest('hex'),bytes:response.cache.body.length,requestCount:response.requests,status:response.status,requestStartedAt:response.requestStartedAt,receivedAt:response.receivedAt,elapsedMs:+new Date(response.receivedAt)-+new Date(response.requestStartedAt),etag:response.cache.etag,lastModified:response.cache.lastModified,officialPublishedAt:null,databaseWrites:0};
 await preserveObject(response.cache.body);await writeFile(path,response.cache.body);await writeFile(metadataPath,JSON.stringify(report,null,2)+'\n');reports.push(report);console.log(JSON.stringify(report));
}
await writeFile('data/provider_previews/open-data-fetch-report.json',JSON.stringify({reports,databaseWrites:0,subscriptions:0},null,2)+'\n');
console.log(JSON.stringify({products:reports.length,newRequests:reports.reduce((sum,r)=>sum+Number('newRequests'in r?r.newRequests:r.requestCount??0),0),databaseWrites:0}));
