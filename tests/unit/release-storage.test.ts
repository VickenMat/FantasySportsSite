import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { preserveObject, retrieveRelease, sourceReceiptPath } from '@/ingestion/open-data/storage';
import { releaseRegistry, releaseRetrievalEnabled } from '@/ingestion/open-data/registry';

it('publishes complete immutable objects atomically across concurrent writers and rejects corruption',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-object-')),bytes=new TextEncoder().encode('verified source body');
  try{
    const hashes=await Promise.all(Array.from({length:12},()=>preserveObject(root,bytes)));
    expect(new Set(hashes).size).toBe(1);
    expect(await readFile(`${root}/objects/${hashes[0]}`,'utf8')).toBe('verified source body');
    await writeFile(`${root}/objects/${hashes[0]}`,'corrupted');
    await expect(preserveObject(root,bytes)).rejects.toThrow('Immutable release object changed');
  }finally{await rm(root,{recursive:true,force:true});}
});

it('conditionally verifies unchanged objects without changing immutable content provenance or trusting a partial alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-cache-')), product = releaseRegistry[0];
  let at = new Date('2026-11-26T12:00:00Z'), requests = 0;
  const first = 'gsis_id,position\n00-1234567,QB\n';
  try {
    const initial = await retrieveRelease(product, { root, clock: () => at, beforeRequest: async () => { requests++; }, fetcher: async () => new Response(first, { headers: { etag: 'body-1', 'last-modified': 'Thu, 26 Nov 2026 10:00:00 GMT' } }) });
    await writeFile(`${root}/${product.directory}/${product.filename}`, 'partial write');
    at = new Date('2026-11-26T13:00:00Z');
    const unchanged = await retrieveRelease(product, { root, clock: () => at, beforeRequest: async () => { requests++; }, fetcher: async (_url, init) => { expect(init?.headers).toMatchObject({ 'If-None-Match': 'body-1' }); return new Response(null, { status: 304 }); } });
    expect(unchanged.metadata.sha256).toBe(initial.metadata.sha256);
    expect(unchanged.metadata.receivedAt).toBe(initial.metadata.receivedAt);
    expect(unchanged.metadata.lastVerifiedAt).toBe(at.toISOString());
    expect(await readFile(`${root}/objects/${initial.metadata.sha256}`, 'utf8')).toBe(first);
    expect(requests).toBe(2);
    const republished = await retrieveRelease(product, { root, clock: () => at, fetcher: async () => new Response(first, { headers: { 'last-modified': 'Thu, 26 Nov 2026 13:00:00 GMT' } }) });
    expect(republished.metadata.lastModified).toBe(initial.metadata.lastModified);
    expect(republished.metadata.officialPublishedAt).toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('requires explicit activation and confines release metadata writes to local development or authorized isolated tests', () => {
  expect(releaseRetrievalEnabled({ DATABASE_URL: 'postgresql://localhost/fantasy_evolution', OPEN_DATA_RELEASE_SYNC: 'true' })).toBe(true);
  expect(releaseRetrievalEnabled({ DATABASE_URL: 'postgresql://other-host/fantasy_evolution', OPEN_DATA_RELEASE_SYNC: 'true' })).toBe(false);
  expect(releaseRetrievalEnabled({ DATABASE_URL: 'postgresql://localhost/fantasy_evolution_test', OPEN_DATA_RELEASE_SYNC: 'true', NODE_ENV: 'test', AUTHORIZED_TEST_DATABASES: 'fantasy_evolution_test' })).toBe(false);
  expect(releaseRetrievalEnabled({ DATABASE_URL: 'postgresql://localhost/fantasy_evolution' })).toBe(false);
});

it('retains the first product-specific receipt across A→B→A without treating pre-approval bytes as fresh',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-rollback-')),product=releaseRegistry[0];
  let at=new Date('2026-11-26T12:00:00Z');
  const a='gsis_id,position\n00-1234567,QB\n',b='gsis_id,position\n00-1234567,RB\n';
  const fetch=(body:string,modified:string)=>retrieveRelease(product,{root,clock:()=>at,fetcher:async()=>new Response(body,{headers:{etag:body===a?'A':'B','last-modified':modified}})});
  try{
    const first=await fetch(a,'Thu, 26 Nov 2026 10:00:00 GMT');
    const legacyPath=`${root}/objects/${first.metadata.sha256}.source.json`,legacy=await readFile(legacyPath,'utf8');
    const firstReceipt=await readFile(sourceReceiptPath(root,product,String(first.metadata.sha256)),'utf8');
    at=new Date('2026-11-28T12:00:00Z');await fetch(b,'Sat, 28 Nov 2026 10:00:00 GMT');
    at=new Date('2026-12-06T12:00:00Z');
    const rollback=await fetch(a,'Sun, 06 Dec 2026 10:00:00 GMT');
    expect(rollback.metadata.receivedAt).toBe(first.metadata.receivedAt);
    expect(rollback.metadata.lastModified).toBe(first.metadata.lastModified);
    expect(rollback.metadata.lastVerifiedAt).toBe(at.toISOString());
    expect(rollback.metadata.latestResponseLastModified).toBe('Sun, 06 Dec 2026 10:00:00 GMT');
    expect(Date.parse(String(rollback.metadata.receivedAt))).toBeLessThan(Date.parse('2026-11-27T01:00:00Z'));
    expect(+at-Date.parse(String(rollback.metadata.receivedAt))).toBeGreaterThan(7*86400000);
    expect(await readFile(legacyPath,'utf8')).toBe(legacy);
    expect(await readFile(sourceReceiptPath(root,product,String(first.metadata.sha256)),'utf8')).toBe(firstReceipt);
    expect(await readFile(`${root}/objects/${first.metadata.sha256}`,'utf8')).toBe(a);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('does not reuse another product first receipt merely because its immutable bytes match',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-source-receipt-')),firstProduct=releaseRegistry[0],otherProduct=releaseRegistry.find(row=>row.id==='nfl-statistics-2026')!;
  const body='same raw bytes from two source products';let at=new Date('2026-11-26T12:00:00Z');
  try{
    const first=await retrieveRelease(firstProduct,{root,clock:()=>at,fetcher:async()=>new Response(body)});
    at=new Date('2026-11-28T12:00:00Z');
    const other=await retrieveRelease(otherProduct,{root,clock:()=>at,fetcher:async()=>new Response(body)});
    expect(other.metadata.sha256).toBe(first.metadata.sha256);
    expect(other.metadata.receivedAt).toBe(at.toISOString());
    expect(sourceReceiptPath(root,firstProduct,String(first.metadata.sha256))).not.toBe(sourceReceiptPath(root,otherProduct,String(other.metadata.sha256)));
    expect(JSON.parse(await readFile(`${root}/objects/${first.metadata.sha256}.source.json`,'utf8')).id).toBe(firstProduct.id);
  }finally{await rm(root,{recursive:true,force:true});}
});

it('migrates a pinned auxiliary legacy receipt without an id and reports an earlier provenance correction separately',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-legacy-first-')),product=releaseRegistry[0],body='same licensed auxiliary bytes';
  let at=new Date('2026-11-27T01:00:00Z');
  try{
    const first=await retrieveRelease(product,{root,clock:()=>at,fetcher:async()=>new Response(body,{headers:{'last-modified':'Thu, 26 Nov 2026 20:00:00 GMT'}})});
    const legacyPath=`${root}/objects/${first.metadata.sha256}.source.json`;
    const legacy=JSON.stringify({sourceReference:product.sourceUrl,sha256:first.metadata.sha256,receivedAt:'2026-11-27T00:20:00.000Z',artifactModifiedAt:'2026-11-26T20:00:00.000Z',provider:product.provider,sport:product.sport});
    // Model pre-existing auxiliary proof plus a later managed first receipt.
    await writeFile(legacyPath,legacy);
    at=new Date('2026-11-27T02:00:00Z');
    const restored=await retrieveRelease(product,{root,clock:()=>at,fetcher:async()=>new Response(null,{status:304})});
    expect(restored.metadata.receivedAt).toBe('2026-11-27T00:20:00.000Z');
    expect(restored.metadata.lastModified).toBe(first.metadata.lastModified);
    expect('firstReceiptDiagnostic'in restored&&restored.firstReceiptDiagnostic).toMatchObject({previousReceivedAt:first.metadata.receivedAt,firstTrustworthyReceivedAt:'2026-11-27T00:20:00.000Z',reason:'EARLIER_RETAINED_RECEIPT_CORRECTS_ALIAS_PROVENANCE'});
    expect(await readFile(legacyPath,'utf8')).toBe(legacy);
    expect(JSON.parse(await readFile(sourceReceiptPath(root,product,String(first.metadata.sha256)),'utf8')).receivedAt).toBe(first.metadata.receivedAt);
  }finally{await rm(root,{recursive:true,force:true});}
});

it('publishes one complete per-product first receipt across concurrent retrieval writers',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-first-concurrent-')),product=releaseRegistry[0],body='atomic source receipt';
  const at=new Date('2026-11-26T12:00:00Z');
  try{
    const results=await Promise.all(Array.from({length:12},()=>retrieveRelease(product,{root,clock:()=>at,fetcher:async()=>new Response(body)})));
    expect(new Set(results.map(result=>result.metadata.receivedAt))).toEqual(new Set([at.toISOString()]));
    const receipt=JSON.parse(await readFile(sourceReceiptPath(root,product,String(results[0].metadata.sha256)),'utf8'));
    expect(receipt).toMatchObject({id:product.id,sourceUrl:product.sourceUrl,receivedAt:at.toISOString()});
    expect(await readFile(`${root}/objects/${receipt.sha256}`,'utf8')).toBe(body);
  }finally{await rm(root,{recursive:true,force:true});}
});

it('retains an earlier acquisition that loses publication race across a later content rollback',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-first-race-')),product=releaseRegistry[0],a='source A',b='source B';
  let ready:()=>void=()=>{},release:()=>void=()=>{};
  const beforePublish=new Promise<void>(resolve=>{ready=resolve;}),continuePublish=new Promise<void>(resolve=>{release=resolve;});
  const earliest=new Date('2026-11-26T12:00:00Z');
  try{
    const delayed=retrieveRelease(product,{root,clock:()=>earliest,fetcher:async()=>new Response(a),commit:async publish=>{ready();await continuePublish;await publish();}});
    await beforePublish;
    const firstWriter=await retrieveRelease(product,{root,clock:()=>new Date('2026-11-27T12:00:00Z'),fetcher:async()=>new Response(a)});
    expect(firstWriter.metadata.receivedAt).toBe('2026-11-27T12:00:00.000Z');
    release();expect((await delayed).metadata.receivedAt).toBe(earliest.toISOString());
    await retrieveRelease(product,{root,clock:()=>new Date('2026-11-28T12:00:00Z'),fetcher:async()=>new Response(b)});
    const rollback=await retrieveRelease(product,{root,clock:()=>new Date('2026-11-29T12:00:00Z'),fetcher:async()=>new Response(a)});
    expect(rollback.metadata.receivedAt).toBe(earliest.toISOString());
  }finally{release();await rm(root,{recursive:true,force:true});}
});
