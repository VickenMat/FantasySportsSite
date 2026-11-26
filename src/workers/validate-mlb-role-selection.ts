import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { sourceProduct } from '@/ingestion/open-data/read';
import { fingerprint } from '@/ingestion/contracts';
import { recalculateScore } from '@/server/score-ledger';
import { playerStatistics } from '@/server/player-statistics';
import type { GameStatRole } from '@/generated/prisma/enums';

assertIsolatedIngestionDatabase();
const db = getDatabase();
try {
  const manifest = JSON.parse(await readFile('data/stat_enrichment/mlb_validated_role_manifest.json', 'utf8'));
  if (fingerprint(manifest.rows) !== manifest.report.targetFingerprint) throw Error('MLB role target fingerprint changed.');
  const source = await sourceProduct('mlb-plays-2026');
  const rows = manifest.rows.filter((row: { role: string | null; status: string }) => row.role && row.status.startsWith('VALIDATED_')) as { role: GameStatRole; playerId: string; gameId: string; source: { sha256: string }; statTargets: { id: string; contentHash: string; role: GameStatRole }[] }[];
  const originalLedgers = await db.scoreLedger.findMany({ orderBy: { id: 'asc' } });
  const originalEntries = await db.scoreLedgerEntry.findMany({ orderBy: { id: 'asc' } });
  const originalStatistics = await db.playerGameStat.count();
  let changed = 0, complete = 0, replayChanges = 0;
  const selectedTargets = [];
  for (const row of rows) {
    if (row.source.sha256 !== source.proof.sha256) throw Error('MLB role source changed.');
    for (const target of row.statTargets) {
      const current = await db.playerGameStat.findFirstOrThrow({ where: { playerId: row.playerId, gameId: row.gameId, role: target.role, provider: 'v9-historical' }, orderBy: { revision: 'desc' } });
      if (current.id !== target.id || current.contentHash !== target.contentHash) throw Error('MLB exact statistical target changed.');
    }
    const result = await recalculateScore({ gameId: row.gameId, playerId: row.playerId, role: row.role, sourceProvider: 'v9-historical', reason: `Reviewed single role from positive starter/batting evidence or complete-game exclusive activity; source ${source.proof.sha256}; manifest ${manifest.report.targetFingerprint}` });
    if (result.changed) changed++;
    if (!result.entry.missingStats.length) complete++;
    if ((await recalculateScore({ gameId: row.gameId, playerId: row.playerId, role: row.role, sourceProvider: 'v9-historical', reason: 'Idempotence verification of the same reviewed role' })).changed) replayChanges++;
    selectedTargets.push({ gameId: row.gameId, playerId: row.playerId, role: row.role, statId: result.entry.statId, missingStats: result.entry.missingStats });
  }
  if (replayChanges || await db.playerGameStat.count() !== originalStatistics) throw Error('MLB selection altered statistics or failed replay.');
  const currentLedgers = await db.scoreLedger.findMany({ where: { id: { in: originalLedgers.map(row => row.id) } }, orderBy: { id: 'asc' } });
  const currentEntries = await db.scoreLedgerEntry.findMany({ where: { id: { in: originalEntries.map(row => row.id) } }, orderBy: { id: 'asc' } });
  const serialize = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
  if (serialize(currentLedgers) !== serialize(originalLedgers) || serialize(currentEntries) !== serialize(originalEntries)) throw Error('Original MLB/global ledger records changed.');
  const sample = await db.game.findUniqueOrThrow({ where: { id: rows[0].gameId } });
  const preset = await db.scoringPreset.findUniqueOrThrow({ where: { version: 'ubp-v9-experimental' } });
  const analytics = await playerStatistics({ playerIds: [...new Set(rows.map(row => row.playerId))], seasonId: sample.seasonId, presetId: preset.id });
  const report = { manifestFingerprint: manifest.report.targetFingerprint, validatedAppearances: rows.length, exclusiveAppearances: manifest.report.validatedExclusiveRoles, starterPriorityAppearances: manifest.report.validatedStarterPriorityRoles, players: new Set(rows.map(row => row.playerId)).size, newLedgerEntries: changed, completeScoredAppearances: complete, replayChanges, originalLedgersPreserved: true, statisticalRevisionsAdded: 0, websiteAnalyticsPlayers: analytics.size, unresolvedBothRoleAppearances: manifest.report.unresolvedBothRoles, otherUnresolvedAppearances: manifest.report.otherUnresolved, developmentWrites: 0, targets: selectedTargets };
  await writeFile('data/stat_enrichment/mlb_role_disposable_validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, targets: undefined }));
} finally { await db.$disconnect(); }
