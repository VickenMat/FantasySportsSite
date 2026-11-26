import 'dotenv/config';
import { mkdtemp, rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, afterEach, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { releaseRegistry } from '@/ingestion/open-data/registry';
import { synchronizeRelease, releaseKey } from '@/ingestion/open-data/scheduler';
import { fingerprint } from '@/ingestion/contracts';

const db = getDatabase(), product = releaseRegistry[0], provider = releaseKey(product).provider;
const priorFlag = process.env.OPEN_DATA_RELEASE_SYNC;
let root: string;
beforeEach(async () => {
  process.env.OPEN_DATA_RELEASE_SYNC = 'true'; root = await mkdtemp(join(tmpdir(), 'release-job-'));
  await db.professionalSyncState.deleteMany({ where: { provider } });
  await db.rateLimitBucket.deleteMany({ where: { OR: [{ key: { startsWith: `professional-request:${fingerprint(provider)}:` } }, { key: { startsWith: `professional-budget-policy:${fingerprint(provider)}:` } }] } });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
afterAll(async () => { if (priorFlag === undefined) delete process.env.OPEN_DATA_RELEASE_SYNC; else process.env.OPEN_DATA_RELEASE_SYNC = priorFlag; await db.$disconnect(); });

it('shares a durable provider lease, budgets redirects and resumes unchanged releases without promoting players', async () => {
  const players = await db.player.count(), stats = await db.playerGameStat.count();
  let at = new Date('2031-01-01T00:00:00Z'), calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return calls === 1 ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/test.csv' } }) : new Response('gsis_id,position\n00-1234567,QB\n', { headers: { etag: 'snapshot' } }); };
  const results = await Promise.all([synchronizeRelease(product, { root, clock: () => at, fetcher }), synchronizeRelease(product, { root, clock: () => at, fetcher })]);
  expect(results.map(result => result.status).sort()).toEqual(['SYNCHRONIZED', 'WAITING']);
  expect(calls).toBe(2);
  let state = await db.professionalSyncState.findUniqueOrThrow({ where: { provider_sport_stream: releaseKey(product) } });
  expect(state.requests).toBe(2); expect(state.leaseToken).toBeNull();
  expect(JSON.parse(state.cursor!)).toMatchObject({ recordsReceived: 1, recordsAccepted: 0, recordsPending: 1, officialPublicationKnown: false });
  expect((await synchronizeRelease(product, { root, clock: () => at, fetcher })).status).toBe('WAITING');
  at = new Date(+state.nextPollAt + 1);
  expect((await synchronizeRelease(product, { root, clock: () => at, fetcher: async () => new Response(null, { status: 304 }) })).status).toBe('SYNCHRONIZED');
  state = await db.professionalSyncState.findUniqueOrThrow({ where: { provider_sport_stream: releaseKey(product) } });
  expect(state.requests).toBe(3); expect(await db.player.count()).toBe(players); expect(await db.playerGameStat.count()).toBe(stats);
});

it('retains Retry-After across ticks and refuses a late response after its lease expires', async () => {
  let at = new Date('2031-02-01T00:00:00Z');
  const result = await synchronizeRelease(product, { root, clock: () => at, fetcher: async () => new Response(null, { status: 429, headers: { 'retry-after': '120' } }) });
  expect(result).toMatchObject({ status: 'BACKOFF', reason: 'HTTP_429' });
  let state = await db.professionalSyncState.findUniqueOrThrow({ where: { provider_sport_stream: releaseKey(product) } });
  expect(+state.nextPollAt).toBe(+at + 120000);
  expect((await synchronizeRelease(product, { root, clock: () => at, fetcher: async () => { throw Error('must not call'); } })).status).toBe('WAITING');
  const otherProduct=releaseRegistry.find(candidate=>candidate.provider===product.provider&&candidate.id!==product.id)!;
  expect((await synchronizeRelease(otherProduct,{root,clock:()=>at,fetcher:async()=>{throw Error('Retry-After must also protect other products from this provider');}})).status).toBe('WAITING');
  at = new Date(+state.nextPollAt + 1);
  const expired = await synchronizeRelease(product, { root, clock: () => at, fetcher: async () => { at = new Date(+at + 300000); return new Response('gsis_id,position\n00-1234567,QB\n'); } });
  expect(expired.status).toBe('BACKOFF');
  state = await db.professionalSyncState.findUniqueOrThrow({ where: { provider_sport_stream: releaseKey(product) } });
  expect(state.cursor).toBeNull(); expect(state.lastSuccessAt).toBeNull(); expect(state.leaseToken).toBeNull();
  await expect(readFile(`${root}/${product.directory}/${product.filename.replace(/\.csv(?:\.gz)?$/,'')}.source.json`)).rejects.toMatchObject({code:'ENOENT'});
});
