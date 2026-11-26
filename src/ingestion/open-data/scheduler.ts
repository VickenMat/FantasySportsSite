import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/db';
import { reserveProviderRequest } from '../request-budget';
import { ProviderFailure, retryDelay } from '../contracts';
import { releaseRegistry, releaseRequestWindows, releaseRetrievalEnabled, type ReleaseProduct } from './registry';
import { retrieveRelease } from './storage';
import { inspectRelease } from './inspection';
import { preserveGameStateObservations } from './state-observations';

class BudgetWait extends Error { constructor(readonly retryAt: Date) { super('Release request budget exhausted.'); } }
export const releaseKey = (product: ReleaseProduct) => ({ provider: `open-release:${product.provider}`, sport: product.sport, stream: `RELEASE:${product.id}` });
export async function synchronizeRelease(product: ReleaseProduct, options: { fetcher?: typeof fetch; root?: string; clock?: () => Date } = {}) {
  if (!product.enabled || !releaseRetrievalEnabled()) return { status: 'DISABLED' as const };
  const db = getDatabase(), clock = options.clock ?? (() => new Date()), at = clock(), key = releaseKey(product), token = randomUUID();
  const claim = await db.$transaction(async tx => {
    // One provider request at a time, across sports and release categories.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key.provider},0))`;
    const state = await tx.professionalSyncState.upsert({ where: { provider_sport_stream: key }, create: { ...key, nextPollAt: at }, update: {} });
    if (state.nextPollAt > at || state.leaseUntil && state.leaseUntil > at) return null;
    if (await tx.professionalSyncState.findFirst({where:{provider:key.provider,lastFailure:'HTTP_429',nextPollAt:{gt:at}}})) return null;
    if (await tx.professionalSyncState.findFirst({ where: { provider: key.provider, leaseUntil: { gt: at } } })) return null;
    return tx.professionalSyncState.update({ where: { id: state.id }, data: { leaseToken: token, leaseUntil: new Date(+at + 240_000) } });
  });
  if (!claim) return { status: 'WAITING' as const };
  const beforeRequest = async () => {
    await db.$transaction(async tx => {
      const active = await tx.professionalSyncState.findUniqueOrThrow({ where: { id: claim.id } });
      if (active.leaseToken !== token || !active.leaseUntil || active.leaseUntil <= clock()) throw Error('Release lease lost.');
      const reservation = await reserveProviderRequest(tx, key.provider, releaseRequestWindows, clock());
      if (reservation.status !== 'RESERVED') throw new BudgetWait(reservation.retryAt);
      await tx.professionalSyncState.update({ where: { id: claim.id }, data: { requests: { increment: 1 } } });
    });
  };
  try {
    const commit=async(publish:()=>Promise<void>)=>db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "ProfessionalSyncState" WHERE id=${claim.id}::uuid FOR UPDATE`;
      const owner=await tx.professionalSyncState.findUniqueOrThrow({where:{id:claim.id}});
      if(owner.leaseToken!==token||!owner.leaseUntil||owner.leaseUntil<=clock())throw Error('Release lease lost before cache publication.');
      await publish();
    });
    const result = await retrieveRelease(product, { ...options, beforeRequest,commit }), processingStartedAt = clock();
    const validation = inspectRelease(product, result.bytes);
    const stateObservations=product.category==='GAME_STATE_SNAPSHOT'?await preserveGameStateObservations(product.id,result.bytes,String(result.metadata.lastVerifiedAt),String(result.metadata.sha256),options.root):null;
    const finished = clock();
    const cursor = { version: 'open-release-sync-1', sourceId: product.id, sha256: result.metadata.sha256, retrievalStatus: result.status, lastRetrievedAt: result.metadata.lastVerifiedAt, firstBodyReceivedAt: result.metadata.receivedAt, artifactTimestamp: result.metadata.lastModified, lastProcessedAt: finished.toISOString(), processingMs: +finished - +processingStartedAt, ...validation, stateObservations, promotion: 'DISABLED_REQUIRES_EXACT_REVIEW' };
    const changed = await db.professionalSyncState.updateMany({ where: { id: claim.id, leaseToken: token, leaseUntil: { gt: finished } }, data: { cursor: JSON.stringify(cursor), lastSuccessAt: finished, failures: 0, lastFailure: null, leaseToken: null, leaseUntil: null, nextPollAt: new Date(+finished + product.refreshIntervalMs) } });
    if (changed.count !== 1) throw Error('Release lease expired before completion.');
    return { status: 'SYNCHRONIZED' as const, sourceId: product.id, requests: result.newRequests, ...validation };
  } catch (error) {
    const now = clock(), failure = error instanceof ProviderFailure ? error : null;
    const next = error instanceof BudgetWait ? error.retryAt : new Date(+now + ([401, 403].includes(failure?.status ?? 0) ? 86_400_000 : retryDelay(claim.failures + 1, 60_000, failure?.retryAfterMs ?? null)));
    const reason = error instanceof BudgetWait ? 'QUOTA_WAIT' : failure ? `HTTP_${failure.status}` : 'RETRIEVAL_OR_VALIDATION_FAILED';
    await db.professionalSyncState.updateMany({ where: { id: claim.id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null, failures: { increment: 1 }, lastFailure: reason, nextPollAt: next } });
    return { status: 'BACKOFF' as const, sourceId: product.id, reason, nextPollAt: next };
  }
}
export async function processOpenReleaseFeeds(maxProducts = 1) {
  if (!releaseRetrievalEnabled()) return { status: 'DISABLED', outcomes: [] };
  const db = getDatabase(), now = new Date(), outcomes = [];
  for (const product of releaseRegistry) {
    const state = await db.professionalSyncState.findUnique({ where: { provider_sport_stream: releaseKey(product) } });
    if (state && state.nextPollAt > now || !product.enabled) continue;
    const outcome=await synchronizeRelease(product);
    if(outcome.status==='WAITING')continue;
    outcomes.push(outcome);
    if (outcomes.length >= maxProducts) break;
  }
  return { status: outcomes.length ? 'PROCESSED' : 'WAITING', outcomes };
}
