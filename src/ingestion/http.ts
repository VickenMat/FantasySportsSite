import {ProviderFailure} from "./contracts";
export type HttpCache={sourceUrl:string;etag:string|null;lastModified:string|null;body:Uint8Array;fetchedAt:string};
export type HttpPolicy={sourceUrl:string;allowedHosts:readonly string[];maxBytes:number;timeoutMs:number;permission:"OPEN_DATA_PREVIEW"|"DISABLED"};
export function retryAfter(value:string|null,now:Date):number|null {
 if(value===null)return null;
 if(/^\d+$/.test(value.trim()))return Math.min(86400000,Number(value)*1000);
 const time=Date.parse(value);return Number.isFinite(time)?Math.min(86400000,Math.max(0,time-+now)):null;
}
/** Central source fetch; preview permission never enables database promotion. */
export async function fetchPublicData(policy:HttpPolicy,cache?:HttpCache,fetcher:typeof fetch=fetch,clock:()=>Date=()=>new Date()) {
 if(policy.permission!=="OPEN_DATA_PREVIEW")return {status:"PENDING_PERMISSION" as const};
 if(!Number.isInteger(policy.maxBytes)||policy.maxBytes<1||policy.maxBytes>64*1024*1024||policy.timeoutMs<100||policy.timeoutMs>60000)throw new Error("Invalid bounded HTTP policy.");
 if(cache&&(cache.sourceUrl!==policy.sourceUrl||cache.body.byteLength>policy.maxBytes))throw new Error("Cached representation does not match the approved source and body bounds.");
 const checked=(value:string)=>{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port||!policy.allowedHosts.includes(url.hostname))throw new Error("Provider URL is outside the approved HTTPS host scope.");return url;};
 let url=checked(policy.sourceUrl);const start=clock();
 const signal=AbortSignal.timeout(policy.timeoutMs);let requests=0;
 for(let redirects=0;redirects<=3;redirects++) {
  const headers:Record<string,string>={Accept:"text/csv, application/json"};
  // Validators follow only allowlisted public redirects; the cache is bound to the stable source URL.
  if(cache){if(cache.etag)headers["If-None-Match"]=cache.etag;if(cache.lastModified)headers["If-Modified-Since"]=cache.lastModified;}
  requests++;const response=await fetcher(url,{headers,redirect:"manual",signal});
  if([301,302,303,307,308].includes(response.status)){
   await response.body?.cancel();const location=response.headers.get("location");if(!location||redirects===3)throw new Error("Provider redirect limit exceeded.");url=checked(new URL(location,url).href);continue;
  }
  if(response.status===304){await response.body?.cancel();if(!cache)throw new Error("Provider returned 304 without a cached representation.");return {status:"NOT_MODIFIED" as const,cache,requests,requestStartedAt:start.toISOString(),receivedAt:clock().toISOString()};}
  if(!response.ok){await response.body?.cancel();throw new ProviderFailure(response.status,retryAfter(response.headers.get("retry-after"),clock()));}
  if(Number(response.headers.get("content-length"))>policy.maxBytes){await response.body?.cancel();throw new Error("Provider body exceeds configured byte limit.");}
  if(!response.body)throw new Error("Provider returned no body.");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>policy.maxBytes)throw new Error("Provider body exceeds configured byte limit.");chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  const receivedAt=clock().toISOString();
  return {status:"FETCHED" as const,cache:{sourceUrl:policy.sourceUrl,body,etag:response.headers.get("etag"),lastModified:response.headers.get("last-modified"),fetchedAt:receivedAt},requests,requestStartedAt:start.toISOString(),receivedAt};
 }
 throw new Error("Provider redirect limit exceeded.");
}
export type ProfessionalGameState="SCHEDULED"|"LIVE"|"SUSPENDED"|"POSTPONED"|"FINAL"|"CANCELLED";
/** Called once per professional game, independently of fantasy league/user count. */
export function professionalPollInterval(state:ProfessionalGameState,startsInMs:number|null,finalAgeMs:number|null,providerMinimumMs:number) {
 if(!Number.isFinite(providerMinimumMs)||providerMinimumMs<1000)throw new Error("A verified provider polling minimum is required.");
 const interval=state==="LIVE"?15000:state==="CANCELLED"?86400000:state==="FINAL"?(finalAgeMs===null||finalAgeMs<86400000?60000:86400000):state==="SUSPENDED"?60000:state==="SCHEDULED"&&startsInMs!==null&&startsInMs<3600000?60000:900000;
 return Math.max(providerMinimumMs,interval);
}
