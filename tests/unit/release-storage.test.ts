import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { preserveObject, retrieveRelease } from '@/ingestion/open-data/storage';
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
