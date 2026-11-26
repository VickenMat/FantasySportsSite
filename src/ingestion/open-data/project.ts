import type { Sport } from '@/generated/prisma/enums';
import { getDatabase } from '@/lib/db';
import { synchronizeProvider } from '../sync';
import type { Observation } from '../contracts';

/** Durable local projection pages are distinct from the bounded upstream HTTP requests. */
export async function projectOpenData(provider: string, sport: Sport, stream: string, snapshot: string, records: Observation[]) {
  const db = getDatabase(), outcomes: Record<string, number> = {};
  let pages = 0;
  const adapter = { fetchPage: async (cursor: string | null) => {
    const previous = cursor ? JSON.parse(cursor) : null;
    const index = previous?.snapshot === snapshot ? previous.index : 0;
    if (!Number.isInteger(index) || index < 0 || index > records.length) throw Error('Invalid local projection cursor.');
    let end = index, size = 200;
    while (end < records.length && end - index < 500) {
      const next = JSON.stringify(records[end]).length + 1;
      if (size + next > 1_500_000) {
        if (end === index) throw Error('Source record exceeds the bounded local page size.');
        break;
      }
      size += next; end++;
    }
    return { records: records.slice(index, end), nextCursor: end < records.length ? JSON.stringify({ snapshot, index: end }) : null };
  } };
  for (;;) {
    const result = await synchronizeProvider(adapter, { provider, sport, stream, minIntervalMs: 1000, maxRequests: 1000, leaseMs: 120000, permission: 'ISOLATED_OPEN_DATA' });
    if (result.status === 'WAITING') { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    if (result.status !== 'PROCESSED') throw Error(`Unexpected projection state ${result.status}`);
    pages++;
    for (const decision of result.decisions) outcomes[decision.outcome] = (outcomes[decision.outcome] ?? 0) + 1;
    const state = await db.professionalSyncState.findUniqueOrThrow({ where: { provider_sport_stream: { provider, sport, stream } } });
    if (!state.cursor) break;
    if (pages > 200) throw Error('Bounded projection exceeded.');
  }
  return { pages, outcomes };
}
