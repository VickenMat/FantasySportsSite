import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import type { GameSide, GameStatRole, Sport } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { replayCorrectedScores } from "@/server/score-ledger";
import { lockSport } from "@/server/sport-lock";
import { hashFile, newSummary, readHistoricalCsv, type ImportSummary } from "./csv";
import { historicalProvider as provider, importerVersion, type HistoricalRow } from "./normalize";

type Transaction = Prisma.TransactionClient;
type Identity = { gameId: string; playerId: string; role: GameStatRole };

function indexBy<T, K>(items: T[], key: (item: T) => K) {
  return new Map(items.map((item) => [key(item), item]));
}

function lookup<K, T>(items: Map<K, T>, key: K): T {
  const item = items.get(key);
  if (item === undefined) throw new Error("An imported identity could not be resolved.");
  return item;
}

const identityKey = ({ gameId, playerId, role }: Identity) => `${gameId}:${playerId}:${role}`;

async function ensurePlayers(tx: Transaction, sport: Sport, rows: HistoricalRow[], providerName: string) {
  const players = indexBy(rows.map(({ player }) => player), ({ externalId }) => externalId);
  const externalIds = [...players.keys()];
  const existing = await tx.playerExternalId.findMany({
    where: { sport, provider: providerName, externalId: { in: externalIds } }, select: { externalId: true, playerId: true },
  });
  const ids = new Map(existing.map(({ externalId, playerId }) => [externalId, playerId]));
  const newPlayers = [...players.values()].filter(({ externalId }) => !ids.has(externalId)).map((player) => ({
    ...player, playerId: randomUUID(),
  }));
  if (newPlayers.length) {
    await tx.player.createMany({
      data: newPlayers.map(({ playerId, displayName }) => ({ id: playerId, sport, displayName })),
    });
    await tx.playerExternalId.createMany({
      data: newPlayers.map(({ playerId, externalId }) => ({ playerId, externalId, sport, provider: providerName })),
    });
    for (const { playerId, externalId } of newPlayers) ids.set(externalId, playerId);
  }
  return ids;
}

async function ensureGames(tx: Transaction, sport: Sport, rows: HistoricalRow[], providerName: string) {
  const seasons = indexBy(rows.map(({ season }) => season), ({ startYear }) => startYear);
  await tx.season.createMany({ data: [...seasons.values()].map((season) => ({ ...season, sport })), skipDuplicates: true });
  // A schedule/league may have created metadata before any statistics arrived.
  // Preserve stronger existing coverage and reconcile only previously unverified rows.
  for (const season of seasons.values()) await tx.season.updateMany({ where: { sport, startYear: season.startYear, coverage: "UNVERIFIED" }, data: { coverage: season.coverage, coverageReason: season.coverageReason } });
  const seasonIds = indexBy(await tx.season.findMany({
    where: { sport, startYear: { in: [...seasons.keys()] } },
  }), ({ startYear }) => startYear);

  const gameRows = indexBy(rows, ({ game }) => game.externalId);
  await tx.game.createMany({
    data: [...gameRows.values()].map(({ game, season }) => ({
      ...game, sport, provider: providerName, seasonId: lookup(seasonIds, season.startYear).id,
    })),
    skipDuplicates: true,
  });
  const games = indexBy(await tx.game.findMany({
    where: { sport, provider: providerName, externalId: { in: [...gameRows.keys()] } },
    select: { id: true, externalId: true, seasonId: true, gameDate: true, phase: true, week: true },
  }), ({ externalId }) => externalId);
  for (const { game, season, line } of rows) {
    const stored = lookup(games, game.externalId);
    if (stored.seasonId !== lookup(seasonIds, season.startYear).id ||
      stored.gameDate?.getTime() !== game.gameDate?.getTime() || stored.phase !== game.phase || stored.week !== game.week) {
      throw new Error(`Line ${line}: conflicting fixture metadata for game ${game.externalId}.`);
    }
  }
  return games;
}

export async function persistHistoricalRows(
  tx: Transaction, sport: Sport, importBatchId: string, rows: HistoricalRow[],
  summary: ImportSummary, correctionReason?: string, providerName = provider, sourceVersion = importerVersion,
) {
  const teams = indexBy(rows.flatMap(({ team, opponent }) => opponent ? [team, opponent] : [team]), ({ externalId }) => externalId);
  await tx.proTeam.createMany({
    data: [...teams.values()].map(({ externalId, displayName, code }) => ({ externalId, displayName, code, sport, provider: providerName })),
    skipDuplicates: true,
  });
  const teamIds = indexBy(await tx.proTeam.findMany({
    where: { sport, provider: providerName, externalId: { in: [...teams.keys()] } }, select: { id: true, externalId: true },
  }), ({ externalId }) => externalId);
  const playerIds = await ensurePlayers(tx, sport, rows, providerName);
  const games = await ensureGames(tx, sport, rows, providerName);
  const positions = [...new Set(rows.flatMap(({ observedPositions }) => observedPositions))];
  if (positions.length) {
    await tx.position.createMany({ data: positions.map((code) => ({ sport, code })), skipDuplicates: true });
  }

  const gameTeams = new Map<string, Map<string, GameSide>>();
  const gameIds = [...games.values()].map(({ id }) => id);
  for (const { gameId, teamId, side } of await tx.gameTeam.findMany({ where: { gameId: { in: gameIds } } })) {
    const participants = gameTeams.get(gameId) ?? new Map<string, GameSide>();
    participants.set(teamId, side);
    gameTeams.set(gameId, participants);
  }
  const links: Prisma.GameTeamCreateManyInput[] = [];
  const resolved = rows.map((row) => {
    const gameId = lookup(games, row.game.externalId).id;
    const teamId = lookup(teamIds, row.team.externalId).id;
    const playerId = lookup(playerIds, row.player.externalId);
    const participants = gameTeams.get(gameId) ?? new Map<string, GameSide>();
    for (const team of row.opponent ? [row.team, row.opponent] : [row.team]) {
      const id = lookup(teamIds, team.externalId).id;
      const prior = participants.get(id);
      if (prior === team.side || (prior && team.side === "UNKNOWN")) continue;
      // The V9 logs have consistent sides within each sport. A future fixture
      // feed can resolve existing UNKNOWN rows without altering raw box scores.
      if (prior || participants.size >= 2 || (team.side !== "UNKNOWN" && [...participants.values()].includes(team.side))) {
        throw new Error(`Line ${row.line}: conflicting participant or home/away side for game ${row.game.externalId}.`);
      }
      participants.set(id, team.side);
      links.push({ gameId, teamId: id, side: team.side });
    }
    gameTeams.set(gameId, participants);
    return { row, identity: { gameId, playerId, role: row.role }, teamId };
  });
  if (links.length) await tx.gameTeam.createMany({ data: links });

  const selected = [...indexBy(resolved.map(({ identity }) => identity), identityKey).values()];
  const revisions = await tx.playerGameStat.findMany({
    where: { provider: providerName, OR: selected },
    orderBy: { revision: "asc" },
    select: { id: true, gameId: true, playerId: true, role: true, contentHash: true, revision: true, importBatchId: true },
  });
  const latest = indexBy(revisions, identityKey);
  const seen = new Set(revisions.map((revision) => `${identityKey(revision)}:${revision.contentHash}`));
  const corrected = new Map<string, Identity>();
  const inserts: Prisma.PlayerGameStatCreateManyInput[] = [];
  const rawColumns = Object.keys(rows[0].raw).sort();

  for (const { row, identity, teamId } of resolved) {
    const key = identityKey(identity);
    const contentHash = createHash("sha256")
      .update(JSON.stringify([sourceVersion, rawColumns.map((column) => [column, row.raw[column]])])).digest("hex");
    const fingerprint = `${key}:${contentHash}`;
    if (seen.has(fingerprint)) {
      summary.duplicateRows++;
      continue;
    }
    const previous = latest.get(key);
    if (previous?.importBatchId === importBatchId) {
      throw new Error(`Line ${row.line}: file contains conflicting rows for the same athlete, game, and role.`);
    }
    if (previous && !correctionReason) {
      throw new Error(`Line ${row.line}: existing box score differs. Review the source and supply --correction-reason to append a revision.`);
    }

    const id = randomUUID();
    const revision = (previous?.revision ?? 0) + 1;
    const next = { ...identity, id, revision, contentHash, importBatchId };
    inserts.push({
      ...next, provider: providerName, teamId, priorRevisionId: previous?.id, sourceLine: row.line,
      raw: row.raw, normalized: row.stats, observedPositions: row.observedPositions,
    });
    latest.set(key, next);
    seen.add(fingerprint);
    if (previous) {
      summary.revisedRows++;
      corrected.set(key, identity);
    } else {
      summary.insertedRows++;
    }
  }
  if (inserts.length) await tx.playerGameStat.createMany({ data: inserts });
  if (correctionReason) await replayCorrectedScores(tx, sport, [...corrected.values()], correctionReason);
}

export async function importHistoricalCsv(input: {
  path: string; sport: Sport; correctionReason?: string; allowRejected?: boolean;
}) {
  const { path, sport, correctionReason, allowRejected } = input;
  const contentHash = await hashFile(path);
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    await lockSport(tx, sport);
    const key = { sport, provider, contentHash, importerVersion };
    const existing = await tx.importBatch.findUnique({ where: { sport_provider_contentHash_importerVersion: key } });
    if (existing) return { batchId: existing.id, alreadyImported: true, summary: existing.summary as ImportSummary };

    const summary = newSummary();
    const batch = await tx.importBatch.create({
      data: { ...key, sourceName: basename(path), correctionReason, summary },
    });
    let rows: HistoricalRow[] = [];
    for await (const row of readHistoricalCsv(path, sport, summary, contentHash)) {
      rows.push(row);
      if (rows.length < 300) continue;
      await persistHistoricalRows(tx, sport, batch.id, rows, summary, correctionReason);
      rows = [];
    }
    if (!summary.validRows) throw new Error(`CSV had no valid rows: ${JSON.stringify(summary.sampleIssues)}.`);
    if (summary.rejectedRows && !allowRejected) {
      throw new Error(`CSV had ${summary.rejectedRows} rejected rows; no changes were applied. Inspect with --validate-only. ${JSON.stringify(summary.sampleIssues)}`);
    }
    if (rows.length) await persistHistoricalRows(tx, sport, batch.id, rows, summary, correctionReason);
    await tx.importBatch.update({ where: { id: batch.id }, data: { summary } });
    return { batchId: batch.id, alreadyImported: false, summary };
  }, { maxWait: 10_000, timeout: 30 * 60_000 });
}
