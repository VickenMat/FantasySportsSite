/** Read-only canonical binding of the separate nine-player historical position proposal. */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { historicalPositionRepairSchema } from '@/server/historical-position-reconciliation';

const directory = 'data/position_enrichment';
const proposal = z.object({ sourceProposalFingerprint: z.string(), auditFingerprint: z.string(),
  historicalSourceRowsForNineRoleCandidates: z.literal(251),
  sourceFingerprints: z.record(z.string(), z.string()),
  historicalRoleCandidates: z.array(z.object({ sourcePlayerId: z.string(), displayName: z.string(),
    explicit2026Pitching: z.object({ knownGames: z.number(), knownStarts: z.number(), knownReliefAppearances: z.number(),
      independentlySupportedRolePositions: z.array(z.enum(['SP', 'RP'])), games: z.array(z.json()) }),
  }).passthrough()).length(9),
}).passthrough().parse(JSON.parse(await readFile(`${directory}/mlb_position_additional_source_proposal.json`, 'utf8')));
const contextPath = `${directory}/mlb_nine_role_generation_context.json`;
let context: { sourceProposalFingerprint: string; knownAt: string };
try {
  context = JSON.parse(await readFile(contextPath, 'utf8'));
  if (context.sourceProposalFingerprint !== proposal.sourceProposalFingerprint) throw Error('Source proposal changed; a separate context review is required.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  context = { sourceProposalFingerprint: proposal.sourceProposalFingerprint, knownAt: new Date().toISOString() };
  await writeFile(contextPath, JSON.stringify(context, null, 2) + '\n');
}
const manifest = historicalPositionRepairSchema.parse({ sport: 'MLB', sourceName: 'Recovered exact per-game pitching role thresholds',
  sourceProvider: 'recovered-mlb-game-role-evidence', rows: proposal.historicalRoleCandidates.map(row => ({
    playerExternalId: row.sourcePlayerId, identityProvider: 'v9-historical', seasonStartYear: 2026,
    positions: row.explicit2026Pitching.independentlySupportedRolePositions, verificationStatus: 'VERIFIED',
    sourceReference: `recovered:${proposal.sourceFingerprints['data/raw/recovered/mlb_2016_2026_final.csv']}; source-proposal:${proposal.sourceProposalFingerprint}; player:${row.sourcePlayerId}; games:${row.explicit2026Pitching.knownGames}; starts:${row.explicit2026Pitching.knownStarts}; relief:${row.explicit2026Pitching.knownReliefAppearances}; game-proof:${fingerprint(row.explicit2026Pitching.games)}`,
    knownAt: context.knownAt,
  })) });
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceHash = sha(manifest), db = getDatabase();
try {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const changes = [], players = [];
    for (const row of manifest.rows) {
      const identity = await tx.playerExternalId.findUniqueOrThrow({ where: { sport_provider_externalId: {
        sport: 'MLB', provider: row.identityProvider, externalId: row.playerExternalId,
      } }, include: { player: { select: { displayName: true, sport: true, isSynthetic: true, isDemo: true } } } });
      if (identity.player.sport !== 'MLB' || identity.player.isSynthetic || identity.player.isDemo) throw Error('Expected a real canonical MLB player.');
      const stats = await tx.playerGameStat.findMany({ where: { playerId: identity.playerId, provider: row.identityProvider,
        game: { season: { sport: 'MLB', startYear: 2026 } } }, orderBy: [{ revision: 'desc' }, { recordedAt: 'desc' }],
        distinct: ['gameId', 'role'], include: { game: { select: { externalId: true } } } });
      if (!stats.length || stats.some(stat => stat.observedPositions.length)) throw Error('Expected only missing latest historical positions for all nine players.');
      const positions = [...row.positions].sort();
      for (const stat of stats) changes.push({ stat, positions, row });
      players.push({ sourcePlayerId: row.playerExternalId, canonicalPlayerId: identity.playerId, displayName: identity.player.displayName,
        positions, historicalStatTargets: stats.length });
    }
    changes.sort((a, b) => a.stat.id.localeCompare(b.stat.id));
    if (changes.length !== proposal.historicalSourceRowsForNineRoleCandidates) throw Error('Canonical latest-row scope differs from the source proposal.');
    const targets = changes.map(({ stat, positions, row }) => ({ priorStatId: stat.id, priorHash: stat.contentHash,
      positions, sourceReference: row.sourceReference, knownAt: row.knownAt.toISOString() }));
    return { changes: changes.length, players: players.length, fingerprint: sha({ sourceHash, targets }), sourceHash,
      applied: false, canonicalPlayers: players, targets, preservedPublication: changes.map(({ stat }) => ({
        priorStatId: stat.id, sourceKnownAt: stat.sourceKnownAt?.toISOString() ?? null,
      })), developmentWrites: 0, currentEligibilityChanges: 0, scoreLedgerChanges: 0,
      knownAtMeaning: 'Local review knowledge only; original publication stays unchanged. No current eligibility or retroactive dated grant.',
      isolatedValidationPending: true, approvalRequired: true };
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  await writeFile(`${directory}/mlb_nine_role_historical_manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(`${directory}/mlb_nine_role_historical_preview.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, targets: undefined, preservedPublication: undefined }, null, 2));
} finally { await db.$disconnect(); }
