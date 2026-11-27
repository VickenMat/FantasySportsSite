import { readFile } from 'node:fs/promises';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { parquetReadObjects } from 'hyparquet';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { fingerprint, observationSchema, type Observation } from '../contracts';
import { assertIsolatedIngestionDatabase, persistObservationInTransaction } from '../persist';
import { professionalPlayerIdentityState } from '../identity-resolutions';
import { resolveProfessionalTeam } from '../professional-identities';
import { observedPolicyAdoptedAt } from '../evidence-policy';
import { releaseRegistry, type ReleaseProduct } from './registry';
import { playerSnapshotsFromRelease } from './player-snapshots';
import { bodyHash } from './storage';

const productIds = ['nfl-rosters-2026','nba-rosters-2027','nba-listed-2027','nhl-rosters-2027','nfl-injuries-2026','mlb-injuries-2026','nba-injuries-2027','nhl-injuries-2027'] as const;
export const recurringSnapshotPolicy = {
  version: 'PERMITTED_EXISTING_CURRENT_SNAPSHOTS_2026_V1', providers: ['nflverse','sportsdataverse'], seasonStartYear: 2026,
  products: productIds.map(id => {
    const row = releaseRegistry.find(value => value.id === id); if (!row) throw Error(`Missing reviewed recurring snapshot product: ${id}`);
    return { id, provider: row.provider, sport: row.sport, sourceUrl: row.sourceUrl, license: row.license, licenseReference: row.licenseReference, maxBytes: row.maxBytes, category: row.category };
  }),
  allowedKinds: ['PLAYER_SNAPSHOT','NBA_POSITION_SNAPSHOT'], allowedFacets: ['POSITION','TEAM_ASSIGNMENT','AVAILABILITY','ROOKIE'],
  nbaPositions: { product: 'nba-rosters-2027', provider: 'sportsdataverse-nba-roster', identityProvider: 'v9-historical', policy: 'NBA_GRANULAR_FAMILY_OBSERVED_V1' },
  rosterFreshnessMs: 7*86400000, injuryFreshnessMs: 48*3600000, maxFactsPerProductCycle: 15000,
  identityPolicy: 'EXISTING_EXPLICIT_CANONICAL_ONLY_NO_DISCOVERY_OR_REASSIGNMENT', temporalPolicy: 'PROSPECTIVE_ACTUAL_PROCESSING_FLOOR_NO_EXACT_SOURCE_TIME_SUBSTITUTION',
  sourcePolicy: 'EXACT_IMMUTABLE_BYTES_AND_NORMALIZED_QUEUE_FINGERPRINT_NEW_BODY_FIRST_RECEIVED_AFTER_APPROVAL',
  excludes: ['RECOVERED_MLB_AGGREGATES','CALENDARS','STATISTICS','SCORE_LEDGERS','NEW_IDENTITIES','NEW_TEAMS','FINANCIAL_RECORDS','OWNERSHIP','RESTRICTED_FEEDS','PROVIDER_SWITCHES'],
} as const;
export const recurringSnapshotPolicyFingerprint = fingerprint(recurringSnapshotPolicy);
export const recurringSnapshotAuthorizationPath = 'data/operations/recurring_snapshot_authorization.json';
const authorizationSchema = z.object({ enabled: z.literal(true), policyFingerprint: z.string().regex(/^[a-f0-9]{64}$/), approvedAt: z.iso.datetime({ offset: true }) }).strict();
const queueSchema = z.object({ sourceId: z.string(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), firstValidatedAt: z.iso.datetime({ offset: true }), candidateCount: z.number().int().nonnegative(), holdCount: z.number().int().nonnegative(), targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/), candidates: z.array(z.unknown()).max(15000) }).passthrough();
export async function loadRecurringSnapshotAuthorization(testAuthorization?: unknown) {
  if (testAuthorization !== undefined) { assertIsolatedIngestionDatabase(); return authorizationSchema.safeParse(testAuthorization); }
  // A development workspace grant cannot authorize a different database or any
  // disposable schema. Tests must use the explicit guarded injection above.
  try {
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (!['localhost','127.0.0.1'].includes(database.hostname) || !['','5432'].includes(database.port) || database.pathname !== '/fantasy_evolution' || database.searchParams.has('schema')) return authorizationSchema.safeParse(null);
  } catch { return authorizationSchema.safeParse(null); }
  try { return authorizationSchema.safeParse(JSON.parse(await readFile(recurringSnapshotAuthorizationPath,'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return authorizationSchema.safeParse(null); throw error; }
}
type Tx = Prisma.TransactionClient;
export type RecurringSnapshotInput = { product: ReleaseProduct; bytes: Uint8Array; metadata: Record<string,unknown>; queue?: unknown; queuePath?: string; receiptPath?: string };
const noCounts = { accepted: 0, replay: 0, pending: 0, quarantined: 0, held: 0 };
/** Caller must hold/fence the source lease throughout this transaction. No file
 * receipt grants replay authority; returned receipt is publishable only after commit.
 */
export async function processRecurringSnapshots(tx: Tx, input: RecurringSnapshotInput, at = new Date(), options: { testAuthorization?: unknown } = {}) {
  const parsedAuthorization = await loadRecurringSnapshotAuthorization(options.testAuthorization);
  const disabled = (reason: string) => ({ status: 'DISABLED' as const, reason, policyFingerprint: recurringSnapshotPolicyFingerprint, ...noCounts });
  const pending = (reason: string) => ({ status: 'PENDING' as const, reason, policyFingerprint: recurringSnapshotPolicyFingerprint, ...noCounts });
  const quarantine = (reason: string) => ({ status: 'QUARANTINED' as const, reason, policyFingerprint: recurringSnapshotPolicyFingerprint, ...noCounts, quarantined: 1 });
  if (!parsedAuthorization.success) return disabled('NO_VALID_EXPLICIT_RECURRING_AUTHORIZATION');
  const authorization = parsedAuthorization.data;
  if (authorization.policyFingerprint !== recurringSnapshotPolicyFingerprint) return disabled('POLICY_FINGERPRINT_NOT_APPROVED');
  if (!Number.isFinite(+at) || new Date(authorization.approvedAt) > at || new Date(authorization.approvedAt) < observedPolicyAdoptedAt) return disabled('AUTHORIZATION_TIME_NOT_APPLICABLE');
  const allowed = recurringSnapshotPolicy.products.find(row => row.id === input.product.id);
  if (!allowed || allowed.sourceUrl !== input.product.sourceUrl || allowed.provider !== input.product.provider || allowed.sport !== input.product.sport || allowed.license !== input.product.license || allowed.licenseReference !== input.product.licenseReference || allowed.maxBytes !== input.product.maxBytes || allowed.category !== input.product.category || !input.product.enabled) return disabled('PRODUCT_OUTSIDE_APPROVED_SCOPE');
  if (!['ROSTER_SNAPSHOT','AVAILABILITY_SNAPSHOT'].includes(input.product.category)) return quarantine('SOURCE_CATEGORY_OUTSIDE_SNAPSHOT_SCOPE');
  const metadata = input.metadata, sha256 = bodyHash(input.bytes), receivedAt = typeof metadata.receivedAt === 'string' ? new Date(metadata.receivedAt) : new Date(NaN);
  if (metadata.id !== allowed.id || metadata.provider !== allowed.provider || metadata.sport !== allowed.sport || metadata.sourceUrl !== allowed.sourceUrl || metadata.sha256 !== sha256 || input.bytes.byteLength > input.product.maxBytes || !Number.isFinite(+receivedAt)) return quarantine('EXACT_SOURCE_RECEIPT_OR_BYTES_MISMATCH');
  if (receivedAt < new Date(authorization.approvedAt)) return pending('PRE_APPROVAL_SOURCE_BODY_REQUIRES_ITS_SEPARATE_EXACT_REVIEW');
  const maxAge = input.product.id.includes('injur') ? recurringSnapshotPolicy.injuryFreshnessMs : recurringSnapshotPolicy.rosterFreshnessMs;
  if (receivedAt > at || +at - +receivedAt > maxAge) return pending('SOURCE_BODY_OUTSIDE_APPROVED_FRESHNESS');
  const queuePath = input.queuePath ?? `data/provider_previews/normalization-queue/${input.product.id}-${sha256}-snapshot-v2.json`;
  let rawQueue = input.queue;
  if (rawQueue === undefined) {
    try { rawQueue = JSON.parse(await readFile(queuePath,'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return pending('NORMALIZED_QUEUE_NOT_AVAILABLE'); if (error instanceof SyntaxError) return quarantine('NORMALIZED_QUEUE_JSON_INVALID'); throw error; }
  }
  const parsedQueue = queueSchema.safeParse(rawQueue);
  if (!parsedQueue.success) return quarantine('NORMALIZED_QUEUE_INVALID_OR_FACT_BOUND_EXCEEDED');
  const queue = parsedQueue.data;
  if (queue.sourceId !== input.product.id || queue.sourceSha256 !== sha256 || queue.candidateCount !== queue.candidates.length || queue.targetFingerprint !== fingerprint(queue.candidates) || new Date(queue.firstValidatedAt) > at || new Date(queue.firstValidatedAt) < receivedAt) return quarantine('EXACT_NORMALIZED_QUEUE_FINGERPRINT_OR_CHRONOLOGY_MISMATCH');
  const rows: Record<string,string>[] = input.product.filename.endsWith('.parquet') ? (await parquetReadObjects({ file: new Uint8Array(input.bytes).buffer,
    compressors: { GZIP: (body,size) => gunzipSync(body,{ maxOutputLength: Math.max(1,size) }), ZSTD: (body,size) => zstdDecompressSync(body,{ maxOutputLength: Math.max(1,size) }) },
  })).map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,value instanceof Date ? value.toISOString() : value == null ? '' : String(value)]))) : parse(input.product.filename.endsWith('.gz') ? gunzipSync(input.bytes,{ maxOutputLength: 128*1024*1024 }) : input.bytes,{ columns: true, skip_empty_lines: true, bom: true });
  if (rows.length > 1000000) return quarantine('SOURCE_ROW_BOUND_EXCEEDED');
  const decoded = playerSnapshotsFromRelease({ proof: { id: input.product.id, sport: input.product.sport, sourceUrl: input.product.sourceUrl, sha256, receivedAt: String(metadata.receivedAt), artifactModifiedAt: typeof metadata.lastModified === 'string' ? metadata.lastModified : null }, rows, at: queue.firstValidatedAt, policyAdoptedAt: observedPolicyAdoptedAt.toISOString() });
  const expectedGeneric = new Set(decoded.observations.map(row => fingerprint(row)));
  const candidates: Observation[] = [];
  for (const raw of queue.candidates) {
    const parsed = observationSchema.safeParse(raw); if (!parsed.success) return quarantine('MALFORMED_SNAPSHOT_CANDIDATE');
    const value = parsed.data, n = value.normalized;
    if (value.sport !== input.product.sport || value.sourceReference !== input.product.sourceUrl || value.effectiveAt !== null || value.publishedAt !== null || value.observedAt !== queue.firstValidatedAt || !('seasonStartYear' in n) || n.seasonStartYear !== recurringSnapshotPolicy.seasonStartYear) return quarantine('CANDIDATE_OUTSIDE_CURRENT_PROSPECTIVE_SOURCE_SCOPE');
    if (n.kind === 'PLAYER_SNAPSHOT') {
      if (!recurringSnapshotPolicy.allowedFacets.some(facet => facet === n.facet.type) || !expectedGeneric.has(fingerprint(value))) return quarantine('CANDIDATE_NOT_DERIVED_FROM_EXACT_SOURCE_BYTES_OR_FACET_NOT_APPROVED');
    } else if (n.kind === 'NBA_POSITION_SNAPSHOT') {
      const index = rows.findIndex(row => row.player_id === n.player.externalId);
      if (input.product.id !== 'nba-rosters-2027' || value.provider !== 'sportsdataverse-nba-roster' || n.player.provider !== 'v9-historical' || index < 0 || rows.filter(row => row.player_id === n.player.externalId).length !== 1 || n.sourcePosition !== (rows[index].position ?? '') || n.sourceRecordId !== `${input.product.id}:line:${index+2}` || n.sourceFingerprint !== sha256 || n.knownAt !== metadata.receivedAt || n.validFrom !== queue.firstValidatedAt || n.validUntil !== new Date(+receivedAt+maxAge).toISOString() || n.sourceSnapshotDate !== null || value.entityKey !== `nba-position:v9-historical:${n.player.externalId}:2026`) return quarantine('NBA_CANDIDATE_NOT_EXACT_DIRECT_ROSTER_EVIDENCE');
    } else return quarantine('ONLY_APPROVED_PLAYER_SNAPSHOT_KINDS_MAY_RECUR');
    candidates.push(value);
  }
  // Duplicate stream/revision copies cannot inflate an accepted cycle's facts.
  if (new Set(candidates.map(row => `${row.provider}:${row.entityKey}:${row.revisionToken}`)).size !== candidates.length) return quarantine('DUPLICATE_NORMALIZED_CANDIDATE_STREAM');
  const counts = { ...noCounts }, holds: { sourcePlayerId: string; reason: string }[] = [];
  const season = await tx.season.findUnique({ where: { sport_startYear: { sport: input.product.sport, startYear: recurringSnapshotPolicy.seasonStartYear } } });
  if (!season) return pending('CURRENT_CANONICAL_SEASON_MISSING_NO_DISCOVERY_AUTHORIZED');
  for (const value of candidates) {
    const n = value.normalized; if (n.kind !== 'PLAYER_SNAPSHOT' && n.kind !== 'NBA_POSITION_SNAPSHOT') throw Error('Validated snapshot scope changed.');
    const identity = await professionalPlayerIdentityState(tx,input.product.sport,n.player,at);
    if (identity.status !== 'RESOLVED' || !identity.mapping) { counts.held++; holds.push({ sourcePlayerId: n.player.externalId, reason: 'EXPLICIT_CANONICAL_IDENTITY_MISSING_CONFLICTED_OR_RETRACTED' }); continue; }
    const player = await tx.player.findFirst({ where: { id: identity.mapping.playerId, sport: input.product.sport, isSynthetic: false, isDemo: false }, select: { id: true } });
    if (!player) { counts.held++; holds.push({ sourcePlayerId: n.player.externalId, reason: 'CANONICAL_PLAYER_UNAVAILABLE' }); continue; }
    const previous = await tx.professionalDataObservation.findFirst({ where: { provider: value.provider, sport: value.sport, category: n.kind, entityKey: value.entityKey, decisions: { some: { outcome: 'ACCEPTED' } } }, include: { decisions: { where: { outcome: 'ACCEPTED' }, orderBy: { version: 'desc' }, take: 1 } }, orderBy: { revisionOrdinal: 'desc' } });
    const oldTarget = previous?.decisions[0]?.targets as { playerId?: string } | undefined;
    if (oldTarget?.playerId && oldTarget.playerId !== player.id) { counts.held++; holds.push({ sourcePlayerId: n.player.externalId, reason: 'CANONICAL_ACTOR_REASSIGNMENT_REQUIRES_SEPARATE_REVIEW' }); continue; }
    if (n.kind === 'PLAYER_SNAPSHOT' && n.facet.type === 'TEAM_ASSIGNMENT' && !await resolveProfessionalTeam(tx,value.sport,n.facet.team)) { counts.held++; holds.push({ sourcePlayerId: n.player.externalId, reason: 'EXPLICIT_CANONICAL_TEAM_MISSING_NO_DISCOVERY_AUTHORIZED' }); continue; }
    const result = await persistObservationInTransaction(tx,value,at);
    if (result.outcome === 'ACCEPTED') counts.accepted++;
    else if (result.outcome === 'DUPLICATE' || result.outcome === 'STALE') counts.replay++;
    else if (result.outcome === 'PENDING_DATA') counts.pending++;
    else counts.quarantined++;
  }
  const receipt = { sourceId: input.product.id, sourceSha256: sha256, targetFingerprint: queue.targetFingerprint, policyFingerprint: recurringSnapshotPolicyFingerprint, authorizationApprovedAt: authorization.approvedAt,
    processedAt: at.toISOString(), sourceFirstReceivedAt: receivedAt.toISOString(), ...counts, holds, localNormalizationHolds: decoded.holds.length,
    semantics: 'PROSPECTIVE_PLAYER_FACTS_ONLY_NO_IDENTITY_STATISTIC_FINANCIAL_OR_OWNERSHIP_WRITES', transactionCommitRequired: true };
  return { status: 'PROCESSED' as const, policyFingerprint: recurringSnapshotPolicyFingerprint, ...counts, receipt,
    receiptPath: input.receiptPath ?? `${queuePath}.recurring-receipt.json` };
}
