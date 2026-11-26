import {writeFile} from 'node:fs/promises';
import {releaseRegistry} from '@/ingestion/open-data/registry';
import {retrieveRelease} from '@/ingestion/open-data/storage';
const reports=[];
for(const source of releaseRegistry){
 const result=await retrieveRelease(source,{cacheOnly:!process.argv.includes('--refresh')});
 const report={...result.metadata,id:source.id,status:result.status,newRequests:result.newRequests};reports.push(report);
 console.log(JSON.stringify({sourceId:source.id,status:result.status,newRequests:result.newRequests}));
}
await writeFile('data/provider_previews/open-data-fetch-report.json',JSON.stringify({reports,databaseWrites:0,subscriptions:0},null,2)+'\n');
console.log(JSON.stringify({products:reports.length,newRequests:reports.reduce((n,r)=>n+r.newRequests,0),databaseWrites:0}));
