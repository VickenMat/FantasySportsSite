import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, link, readdir } from 'node:fs/promises';
import { fetchPublicData, type HttpCache } from '../http';
import { openDataAttribution } from './sources';
import type { ReleaseProduct } from './registry';

export const bodyHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function atomicFile(path: string, value: string | Uint8Array) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, value); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
export async function preserveObject(root: string, bytes: Uint8Array) {
  const hash = bodyHash(bytes), directory = `${root}/objects`;
  await mkdir(directory, { recursive: true });
  const temporary=`${directory}/.${hash}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary,bytes,{flag:'wx'});
    try{await link(temporary,`${directory}/${hash}`);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(bodyHash(await readFile(`${directory}/${hash}`))!==hash)throw Error('Immutable release object changed.');}
  }finally{await rm(temporary,{force:true});}
  return hash;
}
/** Receipt identity includes the product URL: equal bytes from another product
 * are not proof that this source was observed at that other product's time. */
const sourceIdentity=(product:Pick<ReleaseProduct,'id'|'sourceUrl'>)=>createHash('sha256').update(JSON.stringify([product.id,product.sourceUrl])).digest('hex');
export function sourceReceiptPath(root:string,product:Pick<ReleaseProduct,'id'|'sourceUrl'>,sha256:string){
  const source=sourceIdentity(product);
  return `${root}/objects/${sha256}.${source}.source.json`;
}
async function matchingReceipt(path:string,product:ReleaseProduct,sha256:string,strictIdentity:boolean){
  try{
    const value=JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>;
    const url=value.sourceUrl??value.sourceReference;
    const identityMatches=url===product.sourceUrl&&value.sha256===sha256&&
      (value.id===undefined||value.id===product.id)&&(value.provider===undefined||value.provider===product.provider)&&(value.sport===undefined||value.sport===product.sport);
    if(!identityMatches||strictIdentity&&value.id!==product.id){if(strictIdentity)throw Error('Immutable source-specific receipt identity changed.');return null;}
    if(typeof value.receivedAt!=='string'||!Number.isFinite(Date.parse(value.receivedAt)))throw Error('Immutable source receipt has no trustworthy acquisition time.');
    return value;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
async function earlierReceiptHistory(root:string,product:ReleaseProduct,sha256:string){
  const directory=`${root}/source-receipts/${sourceIdentity(product)}/${sha256}`;
  try{return(await Promise.all((await readdir(directory)).filter(name=>/^\d+\.json$/.test(name)).map(name=>matchingReceipt(`${directory}/${name}`,product,sha256,true)))).filter((value):value is Record<string,unknown>=>value!==null);}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return[];throw error;}
}
async function preserveEarlierReceipt(root:string,product:ReleaseProduct,sha256:string,value:Record<string,unknown>){
  const directory=`${root}/source-receipts/${sourceIdentity(product)}/${sha256}`;await mkdir(directory,{recursive:true});
  const path=`${directory}/${Date.parse(String(value.receivedAt))}.json`,temporary=`${directory}/.${randomUUID()}.tmp`;
  try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});try{await link(temporary,path);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}await matchingReceipt(path,product,sha256,true);}
  finally{await rm(temporary,{force:true});}
}
async function preserveSourceReceipt(root:string,product:ReleaseProduct,sha256:string,value:Record<string,unknown>){
  const path=sourceReceiptPath(root,product,sha256),temporary=`${path}.${randomUUID()}.tmp`;
  try{
    await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    try{await link(temporary,path);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    const first=await matchingReceipt(path,product,sha256,true);if(!first)throw Error('Source receipt publication disappeared.');return first;
  }finally{await rm(temporary,{force:true});}
}
export async function retrieveRelease(product: ReleaseProduct, options: { root?: string; beforeRequest?: () => Promise<void>; commit?: (publish:()=>Promise<void>)=>Promise<void>; fetcher?: typeof fetch; clock?: () => Date; cacheOnly?: boolean } = {}) {
  const root = options.root ?? 'data/provider_previews', directory = `${root}/${product.directory}`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${product.filename}`, metadataPath = `${directory}/${product.filename.replace(/\.csv(?:\.gz)?$/, '')}.source.json`;
  let prior: Record<string, unknown> | undefined, cache: HttpCache | undefined;
  try {
    prior = JSON.parse(await readFile(metadataPath, 'utf8'));
    let body: Uint8Array;
    try { body = await readFile(`${root}/objects/${prior!.sha256}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; body = await readFile(path); }
    if (prior!.sourceUrl !== product.sourceUrl || bodyHash(body) !== prior!.sha256) throw Error('Release cache fingerprint mismatch.');
    cache = { sourceUrl: product.sourceUrl, body, etag: prior!.etag as string | null, lastModified: prior!.lastModified as string | null, fetchedAt: prior!.receivedAt as string };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (cache && options.cacheOnly) { await preserveObject(root, cache.body); return { status: 'VERIFIED_LOCAL_SOURCE', newRequests: 0, metadata: prior!, bytes: cache.body }; }
  const response = await fetchPublicData({ sourceUrl: product.sourceUrl, allowedHosts: ['github.com', 'release-assets.githubusercontent.com'], maxBytes: product.maxBytes, timeoutMs: 60000, permission: 'OPEN_DATA_PREVIEW' }, cache, options.fetcher, options.clock, options.beforeRequest);
  if (response.status === 'PENDING_PERMISSION') throw Error('Release retrieval disabled.');
  const sha256 = await preserveObject(root, response.cache.body), sameContent = prior?.sha256 === sha256;
  let metadata = {
    id: product.id, provider: product.provider, sport: product.sport, sourceUrl: product.sourceUrl,
    license: product.license, licenseReference: product.licenseReference, attribution: openDataAttribution,
    sha256, bytes: response.cache.body.byteLength,
    receivedAt: sameContent ? prior!.receivedAt : response.receivedAt,
    lastVerifiedAt: response.receivedAt, requestStartedAt: response.requestStartedAt,
    lastModified: sameContent ? prior!.lastModified : response.cache.lastModified,
    latestResponseLastModified: response.cache.lastModified, etag: response.cache.etag,
    officialPublishedAt: null, requestCount: response.requests, status: response.status,
    elapsedMs: +new Date(response.receivedAt) - +new Date(response.requestStartedAt), databasePromotion: false,
  };
  const specific=await matchingReceipt(sourceReceiptPath(root,product,sha256),product,sha256,true);
  const legacy=await matchingReceipt(`${root}/objects/${sha256}.source.json`,product,sha256,false);
  // Adopt a matching legacy receipt/current pointer without altering either file.
  // A→B→A consults retained history instead of pretending A is newly acquired.
  const historical=[specific,legacy,...await earlierReceiptHistory(root,product,sha256),sameContent?metadata:null].filter((value):value is Record<string,unknown>=>value!==null)
    .sort((left,right)=>Date.parse(String(left.receivedAt))-Date.parse(String(right.receivedAt)))[0];
  const firstCandidate=historical?{...metadata,receivedAt:historical.receivedAt,...(historical.lastModified!==undefined?{lastModified:historical.lastModified}:{})}:metadata;
  // A legacy auxiliary receipt may predate the managed pointer. Preserve the
  // immutable proof and report that correction separately; frozen manifests are
  // never regenerated here and artifact-metadata dates do not become HTTP dates.
  let firstReceiptDiagnostic=historical&&Date.parse(String(historical.receivedAt))<Date.parse(String(metadata.receivedAt))?{
    sourceId:product.id,sourceUrl:product.sourceUrl,sha256,previousReceivedAt:metadata.receivedAt,firstTrustworthyReceivedAt:historical.receivedAt,
    reason:sameContent?'EARLIER_RETAINED_RECEIPT_CORRECTS_ALIAS_PROVENANCE':'RETAINED_RECEIPT_REUSED_AFTER_CONTENT_ROLLBACK',
    recordedArtifactModifiedAt:historical.artifactModifiedAt??null,
  }:null;
  // Receipt and pointer publication remain inside the caller's lease fence. A
  // losing concurrent writer adopts the already-complete immutable receipt.
  const publish=async()=>{
    const first=await preserveSourceReceipt(root,product,sha256,firstCandidate);
    const effectiveFirst=Date.parse(String(firstCandidate.receivedAt))<Date.parse(String(first.receivedAt))?firstCandidate:first;
    if(effectiveFirst===firstCandidate&&Date.parse(String(firstCandidate.receivedAt))<Date.parse(String(first.receivedAt))){
      // An earlier acquisition can lose the first-link race. Retain its own
      // immutable proof so a later A→B→A still finds the true earliest receipt.
      await preserveEarlierReceipt(root,product,sha256,firstCandidate);
      firstReceiptDiagnostic??={sourceId:product.id,sourceUrl:product.sourceUrl,sha256,previousReceivedAt:first.receivedAt,firstTrustworthyReceivedAt:firstCandidate.receivedAt,reason:'EARLIER_CONCURRENT_VERIFIED_RECEIPT_RETAINED',recordedArtifactModifiedAt:null};
    }
    metadata={...metadata,receivedAt:effectiveFirst.receivedAt,...(effectiveFirst.lastModified!==undefined?{lastModified:effectiveFirst.lastModified}:{})};
    if(firstReceiptDiagnostic){
      const proof=JSON.stringify(firstReceiptDiagnostic,null,2)+'\n',hash=createHash('sha256').update(proof).digest('hex');
      const diagnosticPath=`${sourceReceiptPath(root,product,sha256)}.correction-${hash}.json`,temporary=`${root}/objects/.receipt-correction-${randomUUID()}.tmp`;
      try{await writeFile(temporary,proof,{flag:'wx'});try{await link(temporary,diagnosticPath);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
      finally{await rm(temporary,{force:true});}
    }
    await atomicFile(path, response.cache.body);
    await atomicFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
    const receipt=`${root}/objects/.${sha256}.${randomUUID()}.source.tmp`;
    try{
      await writeFile(receipt,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
      try{await link(receipt,`${root}/objects/${sha256}.source.json`);}
      catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    }finally{await rm(receipt,{force:true});}
  };
  if(options.commit)await options.commit(publish);else await publish();
  return { status: response.status, newRequests: response.requests, metadata, bytes: response.cache.body, firstReceiptDiagnostic };
}
