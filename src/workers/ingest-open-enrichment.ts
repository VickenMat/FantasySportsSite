import { stableSourceProof } from '@/ingestion/open-data/provenance';
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { getDatabase } from '@/lib/db';
import { assertIsolatedIngestionDatabase } from '@/ingestion/persist';
import { sourceProduct } from '@/ingestion/open-data/read';
import { projectOpenData } from '@/ingestion/open-data/project';
import { fingerprint, observationSchema, type Observation } from '@/ingestion/contracts';
import { selectAndScoreSource } from '@/ingestion/source-selection';
import { statEntityKey } from '@/ingestion/statistics';
import { calculateScore, type StatValues } from '@/scoring/engine';
import { ubpV9Rules } from '@/scoring/ubp-v9';
import { playerStatistics } from '@/server/player-statistics';
import type { HistoricalStatEnrichmentRow } from '@/server/historical-stat-enrichment';

assertIsolatedIngestionDatabase();
const db = getDatabase(), provider = 'sportsdataverse-open-data';
try {
  const nba = await sourceProduct('nba-rosters-2027'), mlb = await sourceProduct('mlb-plays-2026'), skaters = await sourceProduct('nhl-skaters-2027');
  const manifest = JSON.parse(await readFile('data/stat_enrichment/nhl_real_manifest.json', 'utf8')) as { rows: HistoricalStatEnrichmentRow[]; sourceProofs: unknown[] };
  const identityReports = [];
  for (const product of [nba, mlb, skaters]) {
    const sport = product.source.sport;
    const references = new Map<string, Record<string, string>>();
    for (const row of product.rows) {
      const ids = sport === 'MLB' ? [row.batter_id, row.pitcher_id] : [row.player_id];
      for (const id of ids) if (id && /^\d+$/.test(id)) references.set(id, row);
    }
    const players = await db.playerExternalId.findMany({ where: { provider: 'v9-historical', sport, externalId: { in: [...references.keys()] }, player: { isSynthetic: false, isDemo: false } }, include: { player: true }, orderBy: { externalId: 'asc' } });
    const records: Observation[] = players.map(player => ({
      provider, sport, entityKey: `player:${player.externalId}`, revisionToken: product.proof.sha256,
      revisionOrdinal: Date.parse(product.proof.artifactModifiedAt ?? '') || null,
      sourceReference: product.source.sourceUrl, observedAt: product.proof.receivedAt, effectiveAt: null, publishedAt: null,
      raw: { sourceRecord: references.get(player.externalId)!, sourceProof: stableSourceProof(product.proof) },
      normalized: { kind: 'PLAYER', externalId: player.externalId, displayName: player.player.displayName, links: [{ provider: 'v9-historical', externalId: player.externalId }], discovery: 'EXISTING' },
    }));
    const result = await projectOpenData(provider, sport, 'PLAYER', product.proof.sha256, records);
    identityReports.push({ sport, sourceRows: product.rows.length, uniqueSourcePlayerIds: references.size, canonicalMatches: players.length, unmatchedSourceIds: [...references.keys()].filter(id => !players.some(player => player.externalId === id)), ...result });
  }
  const originals = await db.playerGameStat.findMany({ where: { id: { in: manifest.rows.map(row => row.priorStatId) } }, include: { game: true, team: true, player: { include: { externalIds: { where: { provider: 'v9-historical', sport: 'NHL' } } } } }, orderBy: { id: 'asc' } });
  const targets = new Map(manifest.rows.map(row => [row.priorStatId, row]));
  const snapshot = fingerprint(manifest), source = manifest.sourceProofs as { receivedAt: string; sourceUrl: string }[];
  const observedAt = source.map(proof => proof.receivedAt).sort().at(-1)!;
  if (originals.length !== manifest.rows.length) throw Error('Historical source target is missing.');
  const statistics: Observation[] = originals.map(prior => {
    const target = targets.get(prior.id)!;
    if (prior.contentHash !== target.priorContentHash || prior.gameId !== target.gameId || prior.playerId !== target.playerId || prior.role !== target.role) throw Error('Historical source target changed.');
    return observationSchema.parse({
    provider, sport: 'NHL', entityKey: statEntityKey(prior.gameId, prior.playerId, prior.role), revisionToken: snapshot, revisionOrdinal: 1,
    observedAt, effectiveAt: null, publishedAt: null, sourceReference: source[0].sourceUrl,
    raw: { historicalStatId: prior.id, priorContentHash: prior.contentHash, enrichment: targets.get(prior.id)!, sourceProofs: manifest.sourceProofs },
    normalized: { kind: 'STAT', player: { provider: 'v9-historical', externalId: prior.player.externalIds[0].externalId }, game: { provider: 'v9-historical', externalId: prior.game.externalId }, team: { provider: 'v9-historical', externalId: prior.team.externalId }, role: prior.role, phase: 'FINAL', publicationSemantics: 'UNVERIFIED', initialPublishedAt: null, stats: { ...(prior.normalized as StatValues), ...target.fields } },
  }); });
  const statisticsResult = await projectOpenData(provider, 'NHL', 'STAT', snapshot, statistics);
  const scoring: Record<string, number> = {}, times: number[] = [];
  let completeScores = 0;
  const scoredPlayers = new Set<string>();
  for (const prior of originals.filter(prior => calculateScore(ubpV9Rules, { role: prior.role, stats: { ...(prior.normalized as StatValues), ...targets.get(prior.id)!.fields } }).missingStats.length === 0).slice(0, 100)) {
    const start = Date.now();
    const result = await selectAndScoreSource({ sport: 'NHL', gameId: prior.gameId, playerId: prior.playerId, role: prior.role }, { version: 'sportsdataverse-nhl-real-isolated-1', sources: [{ provider, priority: 0, maxAgeMs: 2 * 86400000, allowProvisional: true, permission: 'ISOLATED_OPEN_DATA' }] });
    times.push(Date.now() - start); scoring[result.status] = (scoring[result.status] ?? 0) + 1;
    if ('entry' in result && result.entry && !result.entry.missingStats.length) completeScores++;
    scoredPlayers.add(prior.playerId);
  }
  const preset = await db.scoringPreset.findUniqueOrThrow({ where: { version: 'ubp-v9-experimental' } });
  const websiteAnalytics = await playerStatistics({ playerIds: [...scoredPlayers], presetId: preset.id, seasonId: originals[0].game.seasonId });
  if (completeScores !== times.length || websiteAnalytics.size !== scoredPlayers.size) throw Error('Real NHL score/website analytics acceptance failed.');
  const report = { identityReports, nhl: { sourceRevisions: statistics.length, statisticsResult, scoring, completeScores, scoringMilliseconds: { min: Math.min(...times), max: Math.max(...times), mean: times.reduce((a, b) => a + b, 0) / times.length }, websiteAnalyticsPlayers: websiteAnalytics.size }, officialPublicationKnown: false, actualCompletionKnown: false, currentEligibilityChanges: 0, competitiveFinalizationEnabled: false, developmentWrites: 0 };
  await writeFile('data/stat_enrichment/multisport_isolated_acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
