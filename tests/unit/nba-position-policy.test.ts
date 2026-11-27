import { expect, it } from 'vitest';
import { normalizeNbaPosition, nbaPositionSnapshotSchema, NBA_POSITION_POLICY, projectNbaPositions, type NbaSnapshotObservation } from '@/positions/nba-policy';
const date = (day: number) => new Date(`2039-11-${String(day).padStart(2,'0')}T12:00:00Z`);
function row(position = 'G', overrides: Partial<NbaSnapshotObservation> = {}): NbaSnapshotObservation {
  return { id: 'snapshot', provider: 'fixture', entityKey: 'nba-position:fixture:player:2039', revisionOrdinal: 1n, observedAt: date(2),
    normalized: { kind: 'NBA_POSITION_SNAPSHOT', player: { provider: 'fixture', externalId: 'player' }, seasonStartYear: 2039, sourcePosition: position,
      sourceRecordId: 'synthetic-row-1', sourceFingerprint: 'a'.repeat(64), sourceSnapshotDate: '2039-11-01', knownAt: date(1).toISOString(), validFrom: date(2).toISOString(), validUntil: null, precision: 'OBSERVED_SNAPSHOT', policyVersion: NBA_POSITION_POLICY, retracted: false },
    decisions: [{ outcome: 'ACCEPTED', decidedAt: date(2), targets: { playerId: 'canonical' } }], ...overrides };
}
const project = (observations: NbaSnapshotObservation[], asOf = date(3)) => projectNbaPositions({ playerId: 'canonical', seasonYear: 2039, asOf, observations });
it('maps every approved family and explicit category without unsupported expansion', () => {
  const cases: Record<string, string[]> = { PG: ['PG'], SG: ['SG'], SF: ['SF'], PF: ['PF'], C: ['C'], G: ['PG','SG'], F: ['PF','SF'], 'G-F': ['PF','PG','SF','SG'], 'F-G': ['PF','PG','SF','SG'], 'F-C': ['C','PF','SF'], 'C-F': ['C','PF','SF'], 'Point Guard': ['PG'], 'Guard / Forward': ['PF','PG','SF','SG'], 'PG/SG': ['PG','SG'], '': [], UNKNOWN: [], 'PG-F': [] };
  for (const [source, expected] of Object.entries(cases)) expect(normalizeNbaPosition(source).positions).toEqual(expected);
});
it('prefers compatible granular in the applicable period, never broadens it or arbitrarily unions conflicts', () => {
  expect(project([row('G'), row('PG', { provider: 'granular' })]).positions).toEqual(['PG']);
  expect(project([row('G'), row('PG-SG', { provider: 'granular' })]).positions).toEqual(['PG','SG']);
  expect(project([row('F'), row('PG', { provider: 'granular' })])).toMatchObject({ positions: [], conflicts: ['INCOMPATIBLE_CURRENT_POSITION_EVIDENCE'] });
  expect(project([row('PG'), row('SG', { provider: 'other' })]).positions).toEqual([]);
});
it('lets a newer applicable family supersede stale granular and retains historical revision/retraction queries', () => {
  const old = row('PG');
  const newer = row('F', { id: 'newer', revisionOrdinal: 2n, observedAt: date(4), normalized: { ...(old.normalized as object), sourcePosition: 'F', validFrom: date(4).toISOString() }, decisions: [{ outcome: 'ACCEPTED', decidedAt: date(4), targets: { playerId: 'canonical' } }] });
  expect(project([old,newer]).positions).toEqual(['PG']);
  expect(project([old,newer],date(4)).positions).toEqual(['PF','SF']);
  const clear = { ...newer, revisionOrdinal: 3n, normalized: { ...(newer.normalized as object), retracted: true } };
  expect(project([old,newer,clear],date(4))).toMatchObject({ available: true, positions: [] });
  expect(project([old,newer,clear]).positions).toEqual(['PG']);
  expect(project([old,old]).positions).toEqual(['PG']);
  expect(project([old,row('SG')]).positions).toEqual([]);
});
it('fails closed before prospective observation/decision or after expiry without inventing effective/publication times', () => {
  expect(project([row()],date(1))).toMatchObject({ available: false, positions: [] });
  const expired = row('G', { normalized: { ...(row().normalized as object), validUntil: date(3).toISOString() } });
  expect(project([expired]).positions).toEqual([]);
  expect(nbaPositionSnapshotSchema.safeParse({ ...(row().normalized as object), validFrom: '2026-01-01T00:00:00Z' }).success).toBe(false);
  expect(project([row('UNKNOWN')])).toMatchObject({ available: true, positions: [] });
});

it('retains a same-revision quarantine marker at the latest contested bound regardless of row order', () => {
  const original = row('PG');
  const rejected = row('SG',{ id: 'rejected', observedAt: date(4), normalized: { ...(row('SG').normalized as object), validFrom: date(4).toISOString() }, decisions: [{ outcome: 'QUARANTINED', decidedAt: date(4), targets: { playerId: 'canonical', nbaPositionConflict: true } }] });
  for (const values of [[original,rejected,original],[rejected,original,original]]) {
    expect(project(values,date(4))).toMatchObject({ positions: [], conflicts: ['SOURCE_STREAM:fixture:nba-position:fixture:player:2039'] });
    expect(project(values,date(3)).positions).toEqual(['PG']);
  }
});
