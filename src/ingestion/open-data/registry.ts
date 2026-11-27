import { openDataSources, openDataAttribution } from './sources';

/** Local conservative budgets, not a claim of a publisher SLA or unlimited license. */
export const releaseRequestWindows = [{ limit: 60, windowMs: 60_000 }, { limit: 600, windowMs: 3_600_000 }];
export const releaseRegistry = openDataSources.map(source => ({
  ...source, enabled: true, usage: 'ATTRIBUTED_REDISTRIBUTION_READ_ONLY' as const,
  category: source.id.includes('injuries') ? 'AVAILABILITY_SNAPSHOT' : source.id.includes('roster') || source.id.includes('listed') ? 'ROSTER_SNAPSHOT' : source.id.includes('game-info') || ['nfl-results-2026','mlb-schedules-2026'].includes(source.id) ? 'GAME_STATE_SNAPSHOT' : 'STATISTICAL_RELEASE',
  refreshIntervalMs: source.id.includes('injuries') ? 21_600_000 : source.sport === 'MLB' ? 86_400_000 : 21_600_000,
  expectedFreshnessMs: source.id.includes('injuries') ? 2 * 86_400_000 : source.sport === 'MLB' ? null : source.id.includes('roster') || source.id.includes('listed') ? 7 * 86_400_000 : 2 * 86_400_000,
  maxConcurrency: 1, failurePolicy: 'PERSISTED_EXPONENTIAL_RETRY_AFTER',
  promotion: 'DISABLED_REQUIRES_EXACT_REVIEW', attribution: openDataAttribution,
}));
export type ReleaseProduct = typeof releaseRegistry[number];

export function releaseRetrievalEnabled(environment: Partial<Pick<NodeJS.ProcessEnv, 'DATABASE_URL' | 'OPEN_DATA_RELEASE_SYNC' | 'NODE_ENV' | 'AUTHORIZED_TEST_DATABASES'>> = process.env) {
  if (environment.OPEN_DATA_RELEASE_SYNC !== 'true' || !environment.DATABASE_URL) return false;
  const url = new URL(environment.DATABASE_URL);
  return url.pathname === '/fantasy_evolution' && ['localhost', '127.0.0.1'].includes(url.hostname) && !url.searchParams.has('schema') ||
    environment.NODE_ENV === 'test' && url.pathname === '/fantasy_evolution_test' && Boolean(url.searchParams.get('schema')?.startsWith('integration_')) && (environment.AUTHORIZED_TEST_DATABASES ?? '').split(',').includes('fantasy_evolution_test');
}
