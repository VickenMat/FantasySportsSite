import {mkdir,readFile,writeFile}from"node:fs/promises";
import{parse}from"csv-parse/sync";
import{fetchPublicData,type HttpCache}from"@/ingestion/http";
import{nflversePlayerPolicy}from"@/ingestion/providers";
import{fingerprint}from"@/ingestion/contracts";
const directory="data/provider_previews/nflverse";await mkdir(directory,{recursive:true});
let cache:HttpCache|undefined;
try{const metadata=JSON.parse(await readFile(`${directory}/cache.json`,"utf8"));if(metadata.sourceUrl===nflversePlayerPolicy.sourceUrl)cache={...metadata,body:await readFile(`${directory}/players.csv`)};}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
const response=await fetchPublicData(nflversePlayerPolicy,cache);
if(response.status==="PENDING_PERMISSION")throw new Error("Provider preview is not permitted.");
const {body,...metadata}=response.cache;
await writeFile(`${directory}/players.csv`,body);await writeFile(`${directory}/cache.json`,JSON.stringify(metadata,null,2)+"\n");
const rows=parse(body,{columns:true,bom:true,skip_empty_lines:true}) as Record<string,string>[];
const identities=new Map<string,Record<string,string>>();const conflicts:string[]=[];let unsupported=0;
for(const row of rows){const id=row.gsis_id;if(!/^\d{2}-\d{7}$/.test(id??"")){unsupported++;continue;}const prior=identities.get(id);if(prior&&fingerprint(prior)!==fingerprint(row)){conflicts.push(id);continue;}identities.set(id,row);}
const preview=[...identities].filter(([id])=>!conflicts.includes(id)).map(([id,row])=>({externalId:id,displayName:row.display_name??row.football_name??row.full_name??null,links:[{provider:"v9-historical",externalId:id},...(row.espn_id?[{provider:"espn",externalId:row.espn_id}]:[])],publishedAt:null,observedAt:response.receivedAt,positionObserved:row.position??null,currentEligibilityPromoted:false}));
const report={sourceReference:nflversePlayerPolicy.sourceUrl,attribution:"nflverse contributors, nflverse-data players release; CC BY 4.0. Preview extracts GSIS/ESPN identity links; no endorsement implied.",licenseReference:"https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",sourceBodyFingerprint:fingerprint(Buffer.from(body).toString("utf8")),rows:rows.length,previewIdentities:preview.length,unsupportedPrimaryIds:unsupported,conflictingPrimaryIds:[...new Set(conflicts)],requestCount:response.requests,cacheStatus:response.status,requestStartedAt:response.requestStartedAt,receivedAt:response.receivedAt,officialPublicationAt:null,databaseWrites:0,scoringChanges:0};
await writeFile(`${directory}/identity_preview.json`,JSON.stringify({report,rows:preview},null,2)+"\n");console.log(JSON.stringify(report,null,2));
