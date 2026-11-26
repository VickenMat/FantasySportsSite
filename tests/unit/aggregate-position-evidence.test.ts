import { expect, it } from 'vitest';
import { aggregatePositionEligibility, aggregatePositionSchema, type AggregatePositionObservation } from '@/positions/aggregate-evidence';
import { observationSchema } from '@/ingestion/contracts';
const at = new Date('2032-11-03T00:00:00Z');
function row(overrides: Partial<AggregatePositionObservation> = {}): AggregatePositionObservation {
  return { provider: 'fixture', entityKey: 'position-aggregate:fixture:athlete:2032:C', revisionOrdinal: 1n,
    observedAt: new Date('2032-11-02T00:00:00Z'), effectiveAt: new Date('2032-11-01T00:00:00Z'), publishedAt: new Date('2032-11-01T12:00:00Z'),
    normalized: { kind: 'POSITION_AGGREGATE', player: { provider: 'fixture', externalId: 'athlete' }, seasonStartYear: 2032, code: 'C', countBasis: 'FIELDING', scope: 'PLAYER_SEASON_TOTAL',
      periodStartsAt: '2032-03-01T00:00:00Z', periodEndsAt: '2032-11-01T00:00:00Z', starts: 10, appearances: 19, retracted: false,
      proof: { basis: 'REVIEWED_COMPLETE_SOURCE_SEASON_TOTAL', includesAllTeams: true, excludesDuplicateTeamTotals: true, sourceFingerprint: 'a'.repeat(64), sourceRows: ['season-total:athlete:C'], reviewReference: 'Synthetic audited season total, not real evidence.' } },
    decisions: [{ outcome: 'ACCEPTED', decidedAt: new Date('2032-11-02T01:00:00Z'), targets: { playerId: 'athlete' } }], ...overrides };
}
function revised(value: ReturnType<typeof row>, changes: object, rest: Partial<AggregatePositionObservation> = {}) {
  return row({ ...value, ...rest, normalized: { ...(value.normalized as object), ...changes } });
}
const calculate = (observations: AggregatePositionObservation[], seasonYear = 2032, asOf = at) => aggregatePositionEligibility({ playerId: 'athlete', observations, seasonYear, asOf });
it('qualifies only a complete reviewed season total at ten starts or twenty appearances for that season and following season', () => {
  expect(calculate([row()]).positions).toEqual(['C']);
  expect(calculate([row()], 2033).positions).toEqual(['C']);
  expect(calculate([row()], 2034)).toMatchObject({ available: false, positions: [] });
  expect(calculate([revised(row(), { starts: 9, appearances: 19 })]).positions).toEqual([]);
  expect(calculate([revised(row(), { starts: 0, appearances: 20 })]).positions).toEqual(['C']);
  const proof = (row().normalized as { proof: object }).proof;
  expect(aggregatePositionSchema.safeParse({ ...(row().normalized as object), proof: { ...proof, includesAllTeams: false } }).success).toBe(false);
  expect(aggregatePositionSchema.safeParse({ ...(row().normalized as object), proof: { ...proof, sourceRows: ['duplicate','duplicate'] } }).success).toBe(false);
  expect(aggregatePositionSchema.safeParse({ ...(row().normalized as object), starts: 21, appearances: 20 }).success).toBe(false);
});
it('fails closed without explicit source publication/effective/known times and never substitutes retrieval', () => {
  for (const value of [row({ publishedAt: null }), row({ effectiveAt: null }), row({ revisionOrdinal: null }), row({ observedAt: new Date('2033-01-01') }), row({ decisions: [{ outcome: 'PENDING_DATA', decidedAt: at, targets: {} }] })]) expect(calculate([value]).positions).toEqual([]);
  expect(calculate([row()], 2032, new Date('2032-11-01T23:00:00Z')).positions).toEqual([]);
  expect(calculate([row({ effectiveAt: new Date('2032-10-01') })]).positions).toEqual([]);
});
it('replays without double counts, replaces and retracts source totals with historical as-of behavior', () => {
  const original = row();
  expect(calculate([original, original]).aggregateCounts).toEqual([{ seasonYear: 2032, code: 'C', starts: 10, appearances: 19 }]);
  const change = revised(original, { starts: 9 }, { revisionOrdinal: 2n, publishedAt: new Date('2032-11-04'), observedAt: new Date('2032-11-04'), decisions: [{ outcome: 'ACCEPTED', decidedAt: new Date('2032-11-04'), targets: { playerId: 'athlete' } }] });
  expect(calculate([original, change]).positions).toEqual(['C']);
  expect(calculate([original, change], 2032, new Date('2032-11-05')).positions).toEqual([]);
  const clear = revised(original, { retracted: true }, { revisionOrdinal: 3n });
  expect(calculate([original, clear])).toMatchObject({ available: true, positions: [], aggregateCounts: [] });
  // Two complete totals at different teams/sources cannot become a fabricated union of 20.
  const nine = revised(original, { starts: 0, appearances: 9 });
  expect(calculate([nine, row({ ...nine, provider: 'second' })]).positions).toEqual([]);
  expect(calculate([nine, revised(row({ provider: 'second' }), { starts: 0, appearances: 11 })])).toMatchObject({ positions: [], aggregateConflicts: ['2032:C'] });
});
it('the ingestion contract retains aggregate scope/proof without LISTED evidence or invented game IDs', () => {
  const value = row();
  expect(observationSchema.parse({ provider: value.provider, sport: 'MLB', entityKey: value.entityKey, revisionToken: '1', revisionOrdinal: 1,
    sourceReference: 'https://fixture.invalid/season-total', observedAt: value.observedAt.toISOString(), effectiveAt: value.effectiveAt!.toISOString(), publishedAt: value.publishedAt!.toISOString(), raw: { synthetic: true }, normalized: value.normalized }).normalized.kind).toBe('POSITION_AGGREGATE');
});

it('fails closed on conflicting same-stream equal revisions regardless of input order or duplicate replay', () => {
  const original = row();
  const conflicting = revised(original, { starts: 9 });
  for (const values of [[original, conflicting, original], [conflicting, original, original]]) {
    expect(calculate(values)).toMatchObject({ available: true, positions: [], aggregateCounts: [], aggregateConflicts: [`STREAM:${original.provider}:${original.entityKey}`] });
  }
  const corrected = revised(original, { starts: 10 }, { revisionOrdinal: 2n });
  expect(calculate([original, conflicting, corrected]).positions).toEqual(['C']);
});

it('requires explicit starting-pitching, relief and DH counts without generic role expansion', () => {
  const cases = [
    { code: 'SP', countBasis: 'STARTING_PITCHING', starts: 10, appearances: 10 },
    { code: 'RP', countBasis: 'RELIEF_PITCHING', starts: 0, appearances: 20 },
    { code: 'DH', countBasis: 'DESIGNATED_HITTER', starts: 0, appearances: 20 },
  ];
  for (const value of cases) {
    const proof = revised(row(), value);
    expect(calculate([proof], 2033).positions).toEqual([value.code]);
    expect(calculate([revised(proof, { countBasis: 'FIELDING' })]).positions).toEqual([]);
    expect(calculate([revised(proof, { starts: 0, appearances: 19 })]).positions).toEqual([]);
  }
  expect(calculate([revised(row(), { code: 'SP', countBasis: 'STARTING_PITCHING', starts: 10, appearances: 20 })]).positions).toEqual([]);
  expect(calculate([revised(row(), { code: 'RP', countBasis: 'RELIEF_PITCHING', starts: 1, appearances: 20 })]).positions).toEqual([]);
  expect(calculate([revised(row(), { code: 'DH', countBasis: 'HITTER', starts: 10, appearances: 20 })]).positions).toEqual([]);
  expect(calculate([revised(row(), { code: 'P', countBasis: 'FIELDING', starts: 10, appearances: 20 })]).positions).toEqual(['P']);
});

it('retains unknown starts for complete appearance evidence without substituting zero', () => {
  for (const value of [
    { code: 'LF', countBasis: 'FIELDING' },
    { code: 'DH', countBasis: 'DESIGNATED_HITTER' },
    { code: 'RP', countBasis: 'RELIEF_PITCHING' },
  ]) {
    const evidence = revised(row(), { ...value, starts: null, appearances: 20 });
    expect(calculate([evidence], 2033)).toMatchObject({ positions: [value.code], aggregateCounts: [{ seasonYear: 2032, code: value.code, starts: null, appearances: 20 }] });
    expect(calculate([revised(evidence, { starts: null, appearances: null })]).positions).toEqual([]);
  }
  expect(calculate([revised(row(), { code: 'SP', countBasis: 'STARTING_PITCHING', starts: 10, appearances: null })]).positions).toEqual(['SP']);
  expect(calculate([revised(row(), { code: 'SP', countBasis: 'STARTING_PITCHING', starts: null, appearances: 20 })]).positions).toEqual([]);
});

it('allows an independently verified team threshold without manufacturing all-team totals or adding lower bounds', () => {
  const proof = (row().normalized as { proof: object }).proof;
  const bound = revised(row(), { scope: 'INDEPENDENT_THRESHOLD', starts: null, appearances: 20, proof: { ...proof, includesAllTeams: false, basis: 'REVIEWED_INDEPENDENT_THRESHOLD' } });
  expect(calculate([bound], 2033)).toMatchObject({ positions: ['C'], aggregateCounts: [], aggregateLowerBounds: [{ seasonYear: 2032, code: 'C', starts: null, appearances: 20 }] });
  const other = row({ ...revised(bound, { appearances: 25 }), provider: 'other-team-source' });
  expect(calculate([bound, other])).toMatchObject({ positions: ['C'], aggregateConflicts: [], aggregateCounts: [] });
  const fifteen = revised(bound, { appearances: 15 });
  expect(calculate([fifteen, row({ ...fifteen, provider: 'second' })]).positions).toEqual([]);
  // A purported full total smaller than a proven subset is a hard conflict.
  expect(calculate([bound, revised(row({ provider: 'total-source' }), { starts: null, appearances: 19 })])).toMatchObject({ positions: [], aggregateConflicts: ['2032:C'] });
});
