import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import type { Sport } from '@/generated/prisma/enums';
import { getDatabase } from '@/lib/db';
import { lockSport } from '@/server/sport-lock';
import { fingerprint, observationSchema } from './contracts';

type Tx = Prisma.TransactionClient;
const referenceSchema = z.object({ provider: z.string().trim().min(1).max(100), externalId: z.string().trim().min(1).max(200) }).strict();
const proofSchema = z.object({
  sourceReference: observationSchema.shape.sourceReference,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  basis: z.enum(['EXPLICIT_PROVIDER_ID', 'INDEPENDENT_IDENTITY_REVIEW', 'SOURCE_RETRACTION']),
  notes: z.string().trim().min(1).max(2000),
}).strict();
export const identityResolutionSchema = z.object({
  version: z.literal('identity-review-1'), sport: z.enum(['NFL', 'MLB', 'NBA', 'NHL']), reference: referenceSchema,
  expectedPlayerId: z.uuid().nullable(), expectedResolutionId: z.uuid().nullable(), replacementPlayerId: z.uuid().nullable(),
  reviewerUserId: z.uuid(), reason: z.string().trim().min(10).max(4000), sourceProofs: z.array(proofSchema).min(1).max(20),
}).strict();
export type IdentityResolutionProposal = z.infer<typeof identityResolutionSchema>;
export type ProfessionalPlayerReference = z.infer<typeof referenceSchema>;
export type ResolvedProfessionalPlayer = ProfessionalPlayerReference & { playerId: string; sport: Sport; source: 'LEGACY' | 'REVIEWED_OVERLAY'; resolutionObservationId: string | null };
export type ProfessionalPlayerIdentityState = { status: 'RESOLVED' | 'MISSING' | 'RETRACTED' | 'CONFLICT'; mapping: ResolvedProfessionalPlayer | null; resolutionId: string | null; revision: bigint | null };
const reviewProvider = 'internal-identity-review';
const entityKey = (sport: Sport, reference: ProfessionalPlayerReference) => `identity-resolution:${fingerprint({ sport, ...reference })}`;

/** Resolve an explicitly reviewed overlay before its immutable legacy anchor.
 * asOf is knowledge time: a review never changes the identity visible before review.
 * Existing statistics, ownership and ledger references are never reattributed here.
 */
export async function professionalPlayerIdentityState(tx: Tx, sport: Sport, rawReference: ProfessionalPlayerReference, asOf = new Date()): Promise<ProfessionalPlayerIdentityState> {
  const reference = referenceSchema.parse(rawReference);
  if (!Number.isFinite(+asOf)) throw Error('Identity resolution needs a valid knowledge instant.');
  const observations = await tx.professionalDataObservation.findMany({
    where: { provider: reviewProvider, sport, category: 'IDENTITY_RESOLUTION', entityKey: entityKey(sport, reference), observedAt: { lte: asOf }, effectiveAt: { lte: asOf } },
    include: { decisions: { where: { decidedAt: { lte: asOf } }, orderBy: { version: 'desc' }, take: 1 } },
    orderBy: [{ revisionOrdinal: 'desc' }, { observedAt: 'desc' }, { id: 'desc' }],
  });
  const accepted = observations.filter(row => row.decisions[0]?.outcome === 'ACCEPTED');
  const latest = accepted[0];
  if (latest) {
    const conflict = (): ProfessionalPlayerIdentityState => ({ status: 'CONFLICT', mapping: null, resolutionId: latest.id, revision: latest.revisionOrdinal });
    if (latest.revisionOrdinal == null || latest.revisionOrdinal < 1n || accepted[1]?.revisionOrdinal === latest.revisionOrdinal) return conflict();
    const raw = latest.raw as { proposal?: unknown } | null;
    const parsed = identityResolutionSchema.safeParse(raw?.proposal);
    if (!parsed.success) return conflict();
    const proposal = parsed.data;
    if (proposal.sport !== sport || proposal.reference.provider !== reference.provider || proposal.reference.externalId !== reference.externalId || fingerprint(proposal) !== latest.contentHash || latest.revisionToken !== latest.contentHash) return conflict();
    const targets = latest.decisions[0].targets as { playerId?: string | null };
    if (targets.playerId !== proposal.replacementPlayerId) return conflict();
    if (!proposal.replacementPlayerId) return { status: 'RETRACTED', mapping: null, resolutionId: latest.id, revision: latest.revisionOrdinal };
    const player = await tx.player.findFirst({ where: { id: proposal.replacementPlayerId, sport }, select: { id: true } });
    if (!player) return conflict();
    return { status: 'RESOLVED', mapping: { ...reference, sport, playerId: player.id, source: 'REVIEWED_OVERLAY', resolutionObservationId: latest.id }, resolutionId: latest.id, revision: latest.revisionOrdinal };
  }
  const legacy = await tx.playerExternalId.findUnique({ where: { sport_provider_externalId: { sport, ...reference } } });
  if (!legacy) return { status: 'MISSING', mapping: null, resolutionId: null, revision: null };
  if (!await tx.player.findFirst({ where: { id: legacy.playerId, sport }, select: { id: true } })) return { status: 'CONFLICT', mapping: null, resolutionId: null, revision: null };
  return { status: 'RESOLVED', mapping: { ...reference, sport, playerId: legacy.playerId, source: 'LEGACY', resolutionObservationId: null }, resolutionId: null, revision: null };
}

export async function resolveProfessionalPlayer(tx: Tx, sport: Sport, reference: ProfessionalPlayerReference, asOf = new Date()) {
  return (await professionalPlayerIdentityState(tx, sport, reference, asOf)).mapping;
}

/** Internal reviewed operation, never an unauthenticated web action.
 * Dry runs may read development. Actual resolution remains isolated-only until
 * a concrete development migration/backfill review authorizes another path.
 */
export async function reviewProfessionalIdentityResolution(raw: unknown, approval?: { expectedFingerprint: string }, at = new Date()) {
  const proposal = identityResolutionSchema.parse(raw), reviewedFingerprint = fingerprint(proposal);
  if (!Number.isFinite(+at)) throw Error('Identity review needs a valid server clock.');
  if (approval?.expectedFingerprint !== undefined && approval.expectedFingerprint !== reviewedFingerprint) throw Error('Identity proposal changed since review.');
  if (approval) {
    // Lazy import avoids a cycle when ingestion uses this resolver.
    const { assertIsolatedIngestionDatabase } = await import('./persist');
    assertIsolatedIngestionDatabase();
  }
  return getDatabase().$transaction(async tx => {
    if (approval) await lockSport(tx, proposal.sport); else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const key = entityKey(proposal.sport, proposal.reference);
    if (await tx.professionalDataObservation.findFirst({ where: { provider: reviewProvider, sport: proposal.sport, category: 'IDENTITY_RESOLUTION', entityKey: key, observedAt: { gt: at }, decisions: { some: { outcome: 'ACCEPTED' } } }, select: { id: true } })) throw Error('Identity review clock predates an accepted review; resolutions cannot be backdated.');
    const prior = await tx.professionalDataObservation.findFirst({ where: { provider: reviewProvider, sport: proposal.sport, category: 'IDENTITY_RESOLUTION', entityKey: key, revisionToken: reviewedFingerprint, contentHash: reviewedFingerprint }, include: { decisions: { orderBy: { version: 'desc' }, take: 1 } } });
    const current = await professionalPlayerIdentityState(tx, proposal.sport, proposal.reference, at);
    if (prior?.decisions[0]?.outcome === 'ACCEPTED') return { fingerprint: reviewedFingerprint, status: 'ALREADY_APPLIED' as const, applied: false, observationId: prior.id, current };
    if (current.status === 'CONFLICT') throw Error('Conflicting identity evidence requires investigation before another resolution.');
    if ((current.mapping?.playerId ?? null) !== proposal.expectedPlayerId || current.resolutionId !== proposal.expectedResolutionId) throw Error('Identity edge changed since review; prepare a fresh expected canonical edge/head.');
    if (!await tx.user.findUnique({ where: { id: proposal.reviewerUserId }, select: { id: true } })) throw Error('An existing reviewer identity is required for audit.');
    if (proposal.replacementPlayerId && !await tx.player.findFirst({ where: { id: proposal.replacementPlayerId, sport: proposal.sport }, select: { id: true } })) throw Error('Replacement must be an existing canonical player in the same sport; this operation never merges or creates players.');
    if (!approval) return { fingerprint: reviewedFingerprint, status: 'REVIEW_REQUIRED' as const, applied: false, observationId: null, current, replacementPlayerId: proposal.replacementPlayerId };
    const observation = await tx.professionalDataObservation.create({ data: {
      provider: reviewProvider, sport: proposal.sport, category: 'IDENTITY_RESOLUTION', entityKey: key,
      revisionToken: reviewedFingerprint, revisionOrdinal: (current.revision ?? 0n) + 1n, contentHash: reviewedFingerprint,
      sourceReference: proposal.sourceProofs[0].sourceReference, observedAt: at, effectiveAt: at, publishedAt: null,
      raw: { proposal, reviewFingerprint: reviewedFingerprint, reviewTimeSemantics: 'LOCAL_REVIEW_EVENT_NOT_OFFICIAL_PUBLICATION' },
      normalized: { kind: 'IDENTITY_RESOLUTION', reference: proposal.reference, previousPlayerId: proposal.expectedPlayerId, playerId: proposal.replacementPlayerId, action: proposal.replacementPlayerId ? 'ASSIGN' : 'RETRACT' },
    } });
    await tx.professionalDataDecision.create({ data: { observationId: observation.id, version: 1, outcome: 'ACCEPTED', reason: proposal.reason, targets: { playerId: proposal.replacementPlayerId, reviewerUserId: proposal.reviewerUserId, expectedPreviousPlayerId: proposal.expectedPlayerId, priorResolutionId: proposal.expectedResolutionId, reviewFingerprint: reviewedFingerprint }, decidedAt: at } });
    return { fingerprint: reviewedFingerprint, status: 'APPLIED' as const, applied: true, observationId: observation.id, current: await professionalPlayerIdentityState(tx, proposal.sport, proposal.reference, at) };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
