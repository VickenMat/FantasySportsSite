import { afterEach, expect, it, vi } from 'vitest';
import { loadRecurringSnapshotAuthorization, recurringSnapshotPolicyFingerprint } from '@/ingestion/open-data/recurring-snapshots';
afterEach(() => vi.unstubAllEnvs());
it.each([
  undefined,
  'postgresql://production.example/fantasy_evolution',
  'postgresql://localhost/fantasy_evolution_test?schema=integration_isolated',
  'postgresql://localhost/fantasy_evolution?schema=public',
  'postgresql://localhost:6543/fantasy_evolution',
])('cannot load a development workspace grant for an unauthorized database context: %s', async databaseUrl => {
  vi.stubEnv('DATABASE_URL',databaseUrl);
  expect((await loadRecurringSnapshotAuthorization()).success).toBe(false);
});
it('rejects injected authorization outside the explicitly authorized isolated test database',async()=>{
  vi.stubEnv('DATABASE_URL','postgresql://localhost/fantasy_evolution');
  await expect(loadRecurringSnapshotAuthorization({enabled:true,policyFingerprint:recurringSnapshotPolicyFingerprint,approvedAt:'2026-11-27T01:00:00Z'})).rejects.toThrow(/authorized isolated/i);
});
