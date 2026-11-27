import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { sourceProduct } from '@/ingestion/open-data/read';
import { fingerprint } from '@/ingestion/contracts';
import { professionalPlayerIdentityState } from '@/ingestion/identity-resolutions';
import { nbaPositionSnapshotSchema, normalizeNbaPosition, NBA_POSITION_POLICY, NBA_POSITION_POLICY_ADOPTED_AT } from '@/positions/nba-policy';

/** Exact post-identity-approval proposal only: read-only database; no eligibility promotion. */
const db = getDatabase();
try {
  const direct = await sourceProduct('nba-rosters-2027'), espn = await sourceProduct('nba-listed-2027');
  const bridge = JSON.parse(await readFile('data/provider_previews/capability_review/nba_identity_bridges.json','utf8')) as { rows: { nbaPlayerId: string; espnAthleteId: string; canonicalPlayerId: string | null; status: string }[] };
  const preparedAt = new Date().toISOString();
  if (new Date(preparedAt) < new Date(NBA_POSITION_POLICY_ADOPTED_AT)) throw Error('Policy adoption floor has not been reached.');
  const directIds = new Set(direct.rows.map(row => row.player_id));
  if (directIds.size !== direct.rows.length) throw Error('Duplicate direct roster identities require review before position promotion.');
  const supplements = bridge.rows.filter(row => row.status === 'VERIFIED_HISTORICAL_DOB_CURRENT_ESPN_PROFILE' && !directIds.has(row.nbaPlayerId));
  if (supplements.length !== 2 || supplements.some(row => !row.canonicalPlayerId)) throw Error('The two independently corroborated supplemental NBA identities changed.');
  const proposals = [
    ...direct.rows.map((row,index) => ({ product: direct, row, sourceLine: index+2, playerRef: { provider: 'v9-historical', externalId: row.player_id }, expectedPlayerId: null as string | null, position: row.position, sourceTeamId: row.team_id })),
    ...supplements.map(bridge => {
      const matches = espn.rows.flatMap((row,index) => row.athlete_id === bridge.espnAthleteId ? [{ row, index }] : []);
      if (matches.length !== 1) throw Error('A supplemental NBA profile is missing or duplicated.');
      return { product: espn, row: matches[0].row, sourceLine: matches[0].index+2, playerRef: { provider: 'espn', externalId: bridge.espnAthleteId }, expectedPlayerId: bridge.canonicalPlayerId, position: matches[0].row.position_abbreviation, sourceTeamId: matches[0].row.team_id };
    }),
  ];
  const targets = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const result = [];
    for (const proposal of proposals) {
      const state = await professionalPlayerIdentityState(tx,'NBA',proposal.playerRef,new Date(preparedAt));
      if (state.status !== 'RESOLVED' || !state.mapping || proposal.expectedPlayerId && proposal.expectedPlayerId !== state.mapping.playerId) throw Error(`NBA identity must be approved/resolved before this proposal: ${proposal.playerRef.externalId}`);
      const player = await tx.player.findFirst({ where: { id: state.mapping.playerId, sport: 'NBA', isSynthetic: false, isDemo: false }, select: { id: true } });
      if (!player) throw Error('A real NBA snapshot cannot target a synthetic/demo player.');
      const normalized = nbaPositionSnapshotSchema.parse({ kind: 'NBA_POSITION_SNAPSHOT', player: proposal.playerRef, seasonStartYear: 2026, sourcePosition: proposal.position,
        sourceRecordId: `${proposal.product.source.id}:line:${proposal.sourceLine}`, sourceFingerprint: proposal.product.proof.sha256, sourceSnapshotDate: null,
        knownAt: proposal.product.proof.receivedAt, validFrom: preparedAt, validUntil: null, policyVersion: NBA_POSITION_POLICY, precision: 'OBSERVED_SNAPSHOT', retracted: false });
      const provider = proposal.product.source.id === direct.source.id ? 'sportsdataverse-nba-roster' : 'sportsdataverse-espn-nba-roster';
      const existing = await tx.professionalDataObservation.findMany({ where: { sport: 'NBA', category: 'NBA_POSITION_SNAPSHOT', decisions: { some: { targets: { path: ['playerId'], equals: player.id } } } }, select: { id: true, contentHash: true } });
      result.push({ playerId: player.id, expectedAlias: { ...proposal.playerRef, expectedPlayerId: player.id, expectedResolutionId: state.resolutionId }, expectedPositionObservations: existing.sort((a,b) => a.id.localeCompare(b.id)),
        derived: normalizeNbaPosition(proposal.position), observation: { provider, sport: 'NBA' as const, entityKey: `nba-position:${proposal.playerRef.provider}:${proposal.playerRef.externalId}:2026`,
          revisionToken: `${proposal.product.proof.sha256}:${preparedAt}`, revisionOrdinal: +new Date(preparedAt), sourceReference: proposal.product.source.sourceUrl, observedAt: preparedAt, effectiveAt: null, publishedAt: null,
          raw: { sourceProduct: proposal.product.source.id, sourceFingerprint: proposal.product.proof.sha256, sourceLine: proposal.sourceLine, sourceTeamId: proposal.sourceTeamId,
            policyAdoptionProcessingTime: NBA_POSITION_POLICY_ADOPTED_AT, firstTrustworthySourceObservation: proposal.product.proof.receivedAt, revisionBasis: 'LOCAL_ORDERED_OBSERVATION_NOT_OFFICIAL_SOURCE_PUBLICATION' }, normalized } });
    }
    if (new Set(result.map(row => row.playerId)).size !== result.length) throw Error('Multiple source alternatives target the same player; reconcile before review, never union.');
    return result.sort((a,b) => a.playerId.localeCompare(b.playerId));
  }, { isolationLevel: 'RepeatableRead', timeout: 120000 });
  const manifest = { version: 'nba-observed-position-promotion-1', preparedAt, policyVersion: NBA_POSITION_POLICY, policyAdoptedAt: NBA_POSITION_POLICY_ADOPTED_AT,
    sourceProofs: [direct.proof,espn.proof], targets };
  const targetFingerprint = fingerprint(manifest);
  const report = { targetFingerprint, targetPlayers: targets.length, directRosterPlayers: direct.rows.length, corroboratedSupplementalPlayers: supplements.length,
    supportedPositionPlayers: targets.filter(row => row.derived.positions.length).length, unknownPositionPlayers: targets.filter(row => !row.derived.positions.length).length,
    explicitPlayers: targets.filter(row => row.derived.classification === 'EXPLICIT').length, familyDerivedPlayers: targets.filter(row => row.derived.classification === 'FAMILY_DERIVED').length,
    expectedObservationAppends: targets.length, expectedDecisionAppends: targets.length, expectedListedEvidenceAppends: 0, exactEffectiveTimestampsSupplied: 0, officialPublicationTimestampsSupplied: 0,
    developmentWrites: 0, status: 'PROPOSED_REQUIRES_POPULATED_COPY_AND_EXACT_APPROVAL' };
  await mkdir('data/position_enrichment',{recursive:true});
  await writeFile('data/position_enrichment/nba_observed_position_promotion_manifest.json',JSON.stringify({ manifest, report },null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await db.$disconnect(); }
