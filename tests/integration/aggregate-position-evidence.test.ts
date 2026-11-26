import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { persistObservation } from '@/ingestion/persist';
import type { Observation } from '@/ingestion/contracts';
import { getEligiblePositions, recordPositionEvidence } from '@/server/positions';
const db = getDatabase(); afterAll(() => db.$disconnect());
it('retains season aggregates separately and gates current/following eligibility on source time, revision and retraction', async () => {
  const provider = `aggregate-fixture-${randomUUID()}`;
  const player = await db.player.create({ data: { sport: 'MLB', displayName: `Synthetic aggregate ${randomUUID()}`, isSynthetic: true } });
  const season = await db.season.upsert({ where: { sport_startYear: { sport: 'MLB', startYear: 2038 } }, create: { sport: 'MLB', startYear: 2038, label: '2038' }, update: {} });
  await db.playerExternalId.create({ data: { playerId: player.id, sport: 'MLB', provider, externalId: 'athlete' } });
  const record: Observation = { provider, sport: 'MLB', entityKey: `position-aggregate:${provider}:athlete:2038:C`, revisionToken: '1', revisionOrdinal: 1,
    sourceReference: 'https://fixture.invalid/reviewed-season-total', observedAt: '2038-11-03T00:00:00Z', publishedAt: null, effectiveAt: null, raw: { synthetic: true },
    normalized: { kind: 'POSITION_AGGREGATE', player: { provider, externalId: 'athlete' }, seasonStartYear: 2038, code: 'C', countBasis: 'FIELDING', scope: 'PLAYER_SEASON_TOTAL', periodStartsAt: '2038-03-01T00:00:00Z', periodEndsAt: '2038-11-01T00:00:00Z', starts: 10, appearances: 19, retracted: false,
      proof: { basis: 'REVIEWED_COMPLETE_SOURCE_SEASON_TOTAL', includesAllTeams: true, excludesDuplicateTeamTotals: true, sourceFingerprint: 'a'.repeat(64), sourceRows: ['synthetic-total-row'], reviewReference: 'Isolated synthetic evidence only' } } };
  const apply = (value: Observation) => db.$transaction(tx => persistObservation(tx, value, new Date(value.observedAt)));
  const eligible = (seasonYear: number, asOf = '2038-11-03T00:00:00Z') => getEligiblePositions({ playerId: player.id, sport: 'MLB', seasonYear, asOf: new Date(asOf) });
  expect((await apply(record)).outcome).toBe('PENDING_DATA');
  expect((await eligible(2038)).positions).toEqual([]);
  const dated: Observation = { ...record, revisionToken: '2', revisionOrdinal: 2, effectiveAt: '2038-11-01T00:00:00Z', publishedAt: '2038-11-02T00:00:00Z' };
  expect((await apply(dated)).outcome).toBe('ACCEPTED');
  expect((await apply(dated)).outcome).toBe('DUPLICATE');
  expect((await eligible(2038)).positions).toEqual(['C']);
  expect((await eligible(2039)).positions).toEqual(['C']);
  expect((await eligible(2040)).positions).toEqual([]);
  expect((await eligible(2038, '2038-11-02T12:00:00Z')).positions).toEqual([]);
  const reduced: Observation = { ...dated, revisionToken: '3', revisionOrdinal: 3, observedAt: '2038-11-04T00:00:00Z', publishedAt: '2038-11-04T00:00:00Z', normalized: { ...dated.normalized, starts: 9 } as typeof dated.normalized };
  expect((await apply(reduced)).outcome).toBe('ACCEPTED');
  expect((await eligible(2038, reduced.observedAt)).positions).toEqual([]);
  expect((await eligible(2038)).positions).toEqual(['C']);
  expect(await db.playerPositionEvidence.count({ where: { playerId: player.id } })).toBe(0);
  // Independent explicit per-game evidence remains sufficient even when a total understates it.
  for (let index = 0; index < 10; index++) {
    const game = await db.game.create({ data: { sport: 'MLB', seasonId: season.id, provider, externalId: `fielding-${index}`, phase: 'REGULAR', startsAt: new Date('2038-10-01T00:00:00Z') } });
    await recordPositionEvidence({ playerId: player.id, seasonId: season.id, provider, externalId: `appearance-${index}`, code: 'C', kind: 'FIELDING', gameId: game.id, started: true, effectiveAt: new Date('2038-10-01T00:00:00Z'), knownAt: new Date('2038-11-04T00:00:00Z') });
  }
  expect(await eligible(2038, reduced.observedAt)).toMatchObject({ positions: ['C'], aggregateConflicts: ['FIELDING_TOTAL:C'] });
  const retracted: Observation = { ...reduced, revisionToken: '4', revisionOrdinal: 4, observedAt: '2038-11-05T00:00:00Z', publishedAt: '2038-11-05T00:00:00Z', normalized: { ...reduced.normalized, retracted: true } as typeof reduced.normalized };
  expect((await apply(retracted)).outcome).toBe('ACCEPTED');
  expect(await eligible(2038, retracted.observedAt)).toMatchObject({ available: true, positions: ['C'], aggregateCounts: [] });
  expect(await db.playerPositionEvidence.count({ where: { playerId: player.id, kind: 'LISTED' } })).toBe(0);
  expect(await db.professionalDataObservation.count({ where: { provider, category: 'POSITION_AGGREGATE' } })).toBe(4);
  if (dated.normalized.kind !== 'POSITION_AGGREGATE') throw new Error('Expected aggregate fixture.');
  for (const value of [
    { code: 'SP' as const, countBasis: 'STARTING_PITCHING' as const, starts: 10, appearances: 10 },
    { code: 'RP' as const, countBasis: 'RELIEF_PITCHING' as const, starts: 0, appearances: 20 },
  ]) {
    const pitching: Observation = { ...dated, entityKey: `position-aggregate:${provider}:athlete:2038:${value.code}`, normalized: { ...dated.normalized, ...value, proof: { ...dated.normalized.proof, sourceRows: [`synthetic-source-athlete-2038-${value.code}`] } } };
    expect((await apply(pitching)).outcome).toBe('ACCEPTED');
    expect((await apply(pitching)).outcome).toBe('DUPLICATE');
    expect((await eligible(2038)).positions).toContain(value.code);
    expect((await eligible(2039)).positions).toContain(value.code);
    expect((await eligible(2040)).positions).not.toContain(value.code);
    expect((await eligible(2039, '2038-11-02T12:00:00Z')).positions).not.toContain(value.code);
  }
  expect(await db.playerPositionEvidence.count({ where: { playerId: player.id, kind: 'LISTED' } })).toBe(0);
});
