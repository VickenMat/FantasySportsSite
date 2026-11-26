import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, link } from 'node:fs/promises';
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
  const metadata = {
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
  // The immutable object exists before the atomic metadata pointer; readers never need a partial alias.
  const publish=async()=>{
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
  return { status: response.status, newRequests: response.requests, metadata, bytes: response.cache.body };
}
