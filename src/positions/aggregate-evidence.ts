import { z } from 'zod';

/** Reviewed source totals or independent lower bounds; never sum team/TOT rows or invent games. */
export const aggregatePositionSchema = z.object({
  kind: z.literal('POSITION_AGGREGATE'),
  player: z.object({ provider: z.string().min(1).max(100), externalId: z.string().min(1).max(200) }).strict(),
  seasonStartYear: z.number().int().min(1900).max(2200),
  code: z.enum(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P', 'SP', 'RP', 'DH']),
  countBasis: z.enum(['FIELDING', 'STARTING_PITCHING', 'RELIEF_PITCHING', 'DESIGNATED_HITTER']),
  scope: z.enum(['PLAYER_SEASON_TOTAL', 'INDEPENDENT_THRESHOLD']),
  periodStartsAt: z.iso.datetime({ offset: true }),
  periodEndsAt: z.iso.datetime({ offset: true }),
  starts: z.number().int().nonnegative().max(500).nullable(),
  appearances: z.number().int().nonnegative().max(500).nullable(),
  retracted: z.boolean(),
  proof: z.object({
    basis: z.enum(['REVIEWED_COMPLETE_SOURCE_SEASON_TOTAL', 'REVIEWED_INDEPENDENT_THRESHOLD']),
    includesAllTeams: z.boolean(),
    excludesDuplicateTeamTotals: z.literal(true),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRows: z.array(z.string().min(1).max(300)).min(1).max(100),
    reviewReference: z.string().min(1).max(1000),
  }).strict(),
}).strict().superRefine((value, context) => {
  if ((value.scope === 'PLAYER_SEASON_TOTAL' ? 'REVIEWED_COMPLETE_SOURCE_SEASON_TOTAL' : 'REVIEWED_INDEPENDENT_THRESHOLD') !== value.proof.basis) context.addIssue({ code: 'custom', message: 'Proof must retain total versus independent-threshold scope.' });
  if (value.scope === 'PLAYER_SEASON_TOTAL' && !value.proof.includesAllTeams) context.addIssue({ code: 'custom', message: 'A season total requires complete all-team proof; independent threshold evidence must retain its lower-bound scope.' });
  const expectedBasis = value.code === 'SP' ? 'STARTING_PITCHING' : value.code === 'RP' ? 'RELIEF_PITCHING' : value.code === 'DH' ? 'DESIGNATED_HITTER' : 'FIELDING';
  if (value.countBasis !== expectedBasis) context.addIssue({ code: 'custom', message: 'Position counts require the matching explicit participation basis, never a generic HITTER/PITCHER role.' });
  if (value.starts === null && value.appearances === null) context.addIssue({ code: 'custom', message: 'At least one explicitly known count is required.' });
  if (value.code === 'SP' && (value.starts === null || value.appearances !== null && value.starts !== value.appearances)) context.addIssue({ code: 'custom', message: 'SP counts must be actual pitching starts only.' });
  if (value.code === 'RP' && (value.appearances === null || value.starts !== null && value.starts !== 0)) context.addIssue({ code: 'custom', message: 'RP appearances require explicit relief evidence and no recorded starts.' });
  if (value.starts !== null && value.appearances !== null && value.starts > value.appearances) context.addIssue({ code: 'custom', message: 'Starts cannot exceed appearances.' });
  if (+new Date(value.periodEndsAt) < +new Date(value.periodStartsAt) ||
      [value.periodStartsAt, value.periodEndsAt].some(date => new Date(date).getUTCFullYear() !== value.seasonStartYear)) {
    context.addIssue({ code: 'custom', message: 'Use an explicit non-reversed MLB season period.' });
  }
  if (new Set(value.proof.sourceRows).size !== value.proof.sourceRows.length) context.addIssue({ code: 'custom', message: 'Duplicate source rows cannot prove non-overlap.' });
});
export type AggregatePosition = z.infer<typeof aggregatePositionSchema>;
export type AggregatePositionObservation = {
  provider: string; entityKey: string; revisionOrdinal: bigint | null;
  observedAt: Date; effectiveAt: Date | null; publishedAt: Date | null; normalized: unknown;
  decisions: { outcome: string; decidedAt: Date; targets: unknown }[];
};

/** Latest accepted source total per stream; neither providers nor periods are added together. */
export function aggregatePositionEligibility(input: {
  playerId: string; seasonYear: number; asOf: Date; observations: readonly AggregatePositionObservation[];
}) {
  const latest = new Map<string, { row: AggregatePositionObservation; value: AggregatePosition; conflict: boolean }>();
  for (const row of input.observations) {
    const parsed = aggregatePositionSchema.safeParse(row.normalized);
    const decision = row.decisions[0];
    const target = decision?.targets && typeof decision.targets === 'object' ? decision.targets as { playerId?: unknown } : null;
    if (!parsed.success || target?.playerId !== input.playerId || decision?.outcome !== 'ACCEPTED' || decision.decidedAt > input.asOf ||
        !row.publishedAt || !row.effectiveAt || row.observedAt > input.asOf || row.publishedAt > input.asOf || row.effectiveAt > input.asOf ||
        row.effectiveAt < new Date(parsed.data.periodEndsAt) || row.revisionOrdinal == null ||
        ![input.seasonYear - 1, input.seasonYear].includes(parsed.data.seasonStartYear)) continue;
    const key = `${row.provider}:${row.entityKey}`;
    const previous = latest.get(key);
    if (!previous || row.revisionOrdinal > previous.row.revisionOrdinal!) latest.set(key, { row, value: parsed.data, conflict: false });
    else if (row.revisionOrdinal === previous.row.revisionOrdinal && JSON.stringify(parsed.data) !== JSON.stringify(previous.value)) previous.conflict = true;
  }
  const grouped = new Map<string, AggregatePosition[]>();
  let available = latest.size > 0;
  const conflicts: string[] = [];
  for (const [stream, { value, conflict }] of latest) {
    if (conflict) { conflicts.push(`STREAM:${stream}`); continue; }
    if (value.retracted) continue;
    const key = `${value.seasonStartYear}:${value.code}`;
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  type Counts = { seasonYear: number; code: string; starts: number | null; appearances: number | null };
  const counts: Counts[] = [], lowerBounds: Counts[] = [];
  for (const [key, values] of grouped) {
    const totals = values.filter(value => value.scope === 'PLAYER_SEASON_TOTAL');
    const bounds = values.filter(value => value.scope === 'INDEPENDENT_THRESHOLD');
    // Complete totals must agree. Lower bounds can differ legitimately; never add them.
    const totalConflict = totals.some(value => value.starts !== totals[0].starts || value.appearances !== totals[0].appearances ||
      +new Date(value.periodStartsAt) !== +new Date(totals[0].periodStartsAt) || +new Date(value.periodEndsAt) !== +new Date(totals[0].periodEndsAt));
    const hardConflict = totals.some(total => bounds.some(bound =>
      bound.starts !== null && total.starts !== null && bound.starts > total.starts ||
      bound.appearances !== null && total.appearances !== null && bound.appearances > total.appearances));
    if (totalConflict || hardConflict) { conflicts.push(key); continue; }
    const toCounts = (value: AggregatePosition): Counts => ({ seasonYear: value.seasonStartYear, code: value.code, starts: value.starts, appearances: value.appearances });
    if (totals.length) counts.push(toCounts(totals[0]));
    lowerBounds.push(...bounds.map(toCounts));
  }

  available ||= conflicts.length > 0;
  return { available, positions: [...new Set([...counts, ...lowerBounds].filter(row => row.starts !== null && row.starts >= 10 || row.appearances !== null && row.appearances >= 20).map(row => row.code))].sort(),
    aggregateLowerBounds: lowerBounds.sort((a,b) => a.seasonYear-b.seasonYear || a.code.localeCompare(b.code)),
    aggregateCounts: counts.sort((a,b) => a.seasonYear-b.seasonYear || a.code.localeCompare(b.code)), aggregateConflicts: conflicts.sort() };
}
