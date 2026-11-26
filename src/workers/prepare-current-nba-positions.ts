import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { sourceProduct } from '@/ingestion/open-data/read';
import { fingerprint } from '@/ingestion/contracts';

const db = getDatabase();
try {
  const source = await sourceProduct('nba-rosters-2027');
  const players = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return tx.playerExternalId.findMany({ where: { provider: 'v9-historical', sport: 'NBA', player: { isSynthetic: false, isDemo: false } } });
  });
  const mappings = new Map(players.map(player => [player.externalId, player.playerId]));
  const groups = new Map<string, typeof source.rows>();
  for (const row of source.rows) groups.set(row.player_id, [...(groups.get(row.player_id) ?? []), row]);
  const rows = [...groups].map(([sourcePlayerId, records]) => {
    const positions = [...new Set(records.map(row => row.position))];
    const teams = [...new Set(records.map(row => row.team_id))];
    const playerId = mappings.get(sourcePlayerId) ?? null;
    return {
      sourcePlayerId, playerId, sourceTeamIds: teams, seasonStartYear: 2026,
      sourcePositionCodes: positions,
      status: !playerId ? 'CANONICAL_ID_NOT_IMPORTED' : positions.length !== 1 || teams.length !== 1 ? 'CONFLICT_REQUIRES_REVIEW' : !positions[0] ? 'POSITION_MISSING' : 'LISTED_EVIDENCE_WITHOUT_EFFECTIVE_TIME',
      // Coarse G/F codes cannot establish the approved five-position eligibility.
      currentEligibilityPromoted: false, effectiveAt: null, publishedAt: null,
    };
  });
  const report = {
    sourceRows: source.rows.length, sourcePlayers: rows.length, importedPlayers: players.length,
    canonicalMatches: rows.filter(row => row.playerId).length,
    unmatchedImportedIds: players.filter(player => !groups.has(player.externalId)).map(player => ({ playerId: player.playerId, sourcePlayerId: player.externalId })),
    statusCounts: Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length])),
    currentEligibilityChanges: 0, historicalBackfillTargets: 0, developmentWrites: 0,
    targetFingerprint: fingerprint(rows),
  };
  await writeFile('data/position_enrichment/nba_current_canonical_review.json', JSON.stringify({ report, source: source.proof, rows }, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await db.$disconnect(); }
