import { z } from 'zod';

export const NBA_POSITION_POLICY = 'NBA_GRANULAR_FAMILY_OBSERVED_V1' as const;
/** Server processing floor of the approved policy; not a claimed user-click instant. */
export const NBA_POSITION_POLICY_ADOPTED_AT = '2026-11-27T00:18:32.000Z';
const granular = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
const family: Record<string, string[]> = { G: ['PG','SG'], F: ['SF','PF'], 'G-F': ['PG','SG','SF','PF'], 'F-G': ['PG','SG','SF','PF'], 'F-C': ['SF','PF','C'], 'C-F': ['SF','PF','C'] };
export function normalizeNbaPosition(raw: string) {
  let normalized = raw.trim().toUpperCase();
  for (const [text, code] of [['POINT GUARD','PG'],['SHOOTING GUARD','SG'],['SMALL FORWARD','SF'],['POWER FORWARD','PF'],['GUARD','G'],['FORWARD','F'],['CENTER','C']]) normalized = normalized.replaceAll(text, code);
  normalized = normalized.replace(/\s*[/,–—-]\s*/g, '-');
  if (granular.has(normalized)) return { normalized, positions: [normalized], classification: 'EXPLICIT' as const };
  if (family[normalized]) return { normalized, positions: [...family[normalized]].sort(), classification: 'FAMILY_DERIVED' as const };
  const explicit = normalized.split('-');
  if (explicit.length > 1 && explicit.every(code => granular.has(code)) && new Set(explicit).size === explicit.length) return { normalized, positions: [...explicit].sort(), classification: 'EXPLICIT' as const };
  return { normalized, positions: [] as string[], classification: 'UNKNOWN' as const };
}
export const nbaPositionSnapshotSchema = z.object({
  kind: z.literal('NBA_POSITION_SNAPSHOT'),
  player: z.object({ provider: z.string().min(1).max(100), externalId: z.string().min(1).max(200) }).strict(),
  seasonStartYear: z.number().int().min(1900).max(2200),
  sourcePosition: z.string().max(100), sourceRecordId: z.string().min(1).max(300), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSnapshotDate: z.iso.date().nullable(),
  knownAt: z.iso.datetime({ offset: true }), validFrom: z.iso.datetime({ offset: true }), validUntil: z.iso.datetime({ offset: true }).nullable(),
  policyVersion: z.literal(NBA_POSITION_POLICY), precision: z.literal('OBSERVED_SNAPSHOT'), retracted: z.boolean(),
}).strict().superRefine((value, context) => {
  if (+new Date(value.validFrom) < Math.max(+new Date(value.knownAt), +new Date(NBA_POSITION_POLICY_ADOPTED_AT)) ||
      value.validUntil !== null && +new Date(value.validUntil) <= +new Date(value.validFrom)) context.addIssue({ code: 'custom', message: 'Use a prospective approved observation period without backdated eligibility.' });
});
export type NbaPositionSnapshot = z.infer<typeof nbaPositionSnapshotSchema>;
export type NbaSnapshotObservation = {
  id: string; provider: string; entityKey: string; revisionOrdinal: bigint | null;
  observedAt: Date; normalized: unknown;
  decisions: { outcome: string; decidedAt: Date; targets: unknown }[];
};
export type NbaApplicableEvidence = {
  id: string; provider: string; entityKey: string; seasonYear: number; sourcePosition: string;
  validFrom: Date; validUntil: Date | null; knownAt: Date; retracted: boolean;
  sourceRecordId?: string; sourceFingerprint?: string; sourceSnapshotDate?: string | null;
  policyVersion?: string; precision?: string; revisionOrdinal?: string;
  normalizedPosition?: string; derivedFantasyPositions?: string[]; classification?: 'EXPLICIT' | 'FAMILY_DERIVED' | 'UNKNOWN';
};
/** Select an applicable period before specificity. Never union conflicting source alternatives. */
export function projectNbaPositions(input: { playerId: string; seasonYear: number; asOf: Date; observations: readonly NbaSnapshotObservation[]; legacy?: readonly NbaApplicableEvidence[] }) {
  const latest = new Map<string, { row: NbaSnapshotObservation; value: NbaPositionSnapshot; conflict: boolean }>();
  for (const row of input.observations) {
    const parsed = nbaPositionSnapshotSchema.safeParse(row.normalized), decision = row.decisions[0];
    const targets = decision?.targets as { playerId?: string; nbaPositionConflict?: boolean } | undefined;
    if (!parsed.success || targets?.playerId !== input.playerId || !['ACCEPTED','QUARANTINED'].includes(decision?.outcome ?? '') ||
        decision?.outcome === 'QUARANTINED' && !targets?.nbaPositionConflict || decision.decidedAt > input.asOf || row.observedAt > input.asOf ||
        row.revisionOrdinal === null || parsed.data.seasonStartYear !== input.seasonYear || new Date(parsed.data.knownAt) > input.asOf || new Date(parsed.data.validFrom) > input.asOf) continue;
    const key = `${row.provider}:${row.entityKey}`, previous = latest.get(key);
    if (!previous || row.revisionOrdinal > previous.row.revisionOrdinal!) latest.set(key, { row, value: parsed.data, conflict: decision.outcome === 'QUARANTINED' });
    else if (row.revisionOrdinal === previous.row.revisionOrdinal) {
      previous.conflict ||= decision.outcome === 'QUARANTINED' || JSON.stringify(parsed.data) !== JSON.stringify(previous.value);
      // Preserve the latest contested applicability bound regardless of row order.
      if (+new Date(parsed.data.validFrom) > +new Date(previous.value.validFrom)) { previous.row = row; previous.value = parsed.data; }
    }
  }
  const candidates: NbaApplicableEvidence[] = [];
  const conflicts: string[] = [], blockedIds = new Set<string>();
  for (const [stream, { row, value, conflict }] of latest) {
    if (conflict) blockedIds.add(row.id);
    void stream;
    candidates.push({ id: row.id, provider: row.provider, entityKey: row.entityKey, seasonYear: value.seasonStartYear, sourcePosition: value.sourcePosition,
      validFrom: new Date(value.validFrom), validUntil: value.validUntil ? new Date(value.validUntil) : null, knownAt: new Date(value.knownAt), retracted: value.retracted,
      sourceRecordId: value.sourceRecordId, sourceFingerprint: value.sourceFingerprint, sourceSnapshotDate: value.sourceSnapshotDate,
      policyVersion: value.policyVersion, precision: value.precision, revisionOrdinal: row.revisionOrdinal!.toString(),
      normalizedPosition: normalizeNbaPosition(value.sourcePosition).normalized,
      derivedFantasyPositions: normalizeNbaPosition(value.sourcePosition).positions, classification: normalizeNbaPosition(value.sourcePosition).classification });
  }
  candidates.push(...(input.legacy ?? []).filter(row => row.seasonYear === input.seasonYear && row.knownAt <= input.asOf && row.validFrom <= input.asOf));
  const active = candidates.filter(row => !row.validUntil || row.validUntil > input.asOf);
  if (!active.length) return { available: candidates.length > 0, positions: [] as string[], conflicts, provenance: [] as NbaApplicableEvidence[] };
  const newest = Math.max(...active.map(row => +row.validFrom));
  const period = active.filter(row => +row.validFrom === newest), live = period.filter(row => !row.retracted);
  for (const row of period) if (blockedIds.has(row.id)) conflicts.push(`SOURCE_STREAM:${row.provider}:${row.entityKey}`);
  if (conflicts.length) return { available: true, positions: [] as string[], conflicts, provenance: period };
  const mapped = live.map(row => ({ ...row, ...normalizeNbaPosition(row.sourcePosition) }));
  const explicit = mapped.filter(row => row.classification === 'EXPLICIT'), fallback = mapped.filter(row => row.classification === 'FAMILY_DERIVED');
  const choices = explicit.length ? explicit : fallback;
  const positions = choices[0]?.positions ?? [];
  if (choices.some(row => row.positions.join('|') !== positions.join('|')) || explicit.length && fallback.some(row => positions.some(code => !row.positions.includes(code)))) conflicts.push('INCOMPATIBLE_CURRENT_POSITION_EVIDENCE');
  return { available: true, positions: conflicts.length ? [] : positions, conflicts, provenance: period };
}
