import { getDatabase } from '@/lib/db';
import { workerState } from '@/server/worker-health';
import { releaseKey } from './scheduler';
import { releaseRegistry, releaseRequestWindows } from './registry';

export async function releaseOperations(at = new Date()) {
  const db = getDatabase();
  const [states, heartbeat] = await Promise.all([
    db.professionalSyncState.findMany({ where: { provider: { startsWith: 'open-release:' } } }),
    db.backgroundJobRun.findUnique({ where: { key: 'worker:professional-data' }, select: { status: true, startedAt: true, result: true } }),
  ]);
  const disabled=(heartbeat?.result as {releaseStatus?:string}|null)?.releaseStatus==='DISABLED';
  const products = releaseRegistry.map(product => {
    const key = releaseKey(product), state = states.find(row => row.provider === key.provider && row.sport === product.sport && row.stream === key.stream);
    let cursor: Record<string, unknown> = {};
    try { cursor = state?.cursor ? JSON.parse(state.cursor) : {}; } catch { cursor = { invalidCursor: true }; }
    const artifact = typeof cursor.artifactTimestamp === 'string' ? Date.parse(cursor.artifactTimestamp) : NaN;
    const freshness = !Number.isFinite(artifact) ? 'UNKNOWN' : product.expectedFreshnessMs === null ? 'HISTORICAL_NO_LIVE_SLA' : +at - artifact > product.expectedFreshnessMs ? 'STALE' : 'WITHIN_EXPECTED_BATCH_AGE';
    return { sourceId: product.id, provider: product.provider, sport: product.sport, category: product.category, configuredEnabled:product.enabled,enabled: product.enabled&&!disabled, endpoint: product.sourceUrl, usage: product.usage, attribution: product.attribution, refreshIntervalMs: product.refreshIntervalMs, expectedFreshnessMs: product.expectedFreshnessMs, maxConcurrency: product.maxConcurrency, failurePolicy: product.failurePolicy, promotion: product.promotion,
      status: !product.enabled||disabled ? 'DISABLED' : state?.lastFailure ? 'RETRYING' : state?.lastSuccessAt ? 'SYNCHRONIZED' : 'AWAITING_FIRST_RETRIEVAL', sourceFreshness: freshness,
      requestsConsumed: state?.requests ?? 0, failures: state?.failures ?? 0, lastFailure: state?.lastFailure ?? null, nextPollAt: state?.nextPollAt ?? null, leaseUntil: state?.leaseUntil ?? null, cursor };
  });
  return { worker: (heartbeat?.result as {stoppedAt?:string}|null)?.stoppedAt?'STOPPED':workerState(heartbeat, at, 180_000),retrievalActivation:disabled?'DISABLED':'CONFIGURED', transport: 'CONDITIONAL_BATCH_RELEASES', liveFeedEnabled: false, competitiveScoring: 'PENDING_AUTHORITATIVE_TIMESTAMPS', requestWindows: releaseRequestWindows, products };
}
