import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { GameStatRole, Sport } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { calculateScore, chooseRole, engineVersion, formatScore } from "@/scoring/engine";
import { ubpV9 } from "@/scoring/ubp-v9";
import { historicalProvider } from "@/imports/normalize";
import { lockSport } from "./sport-lock";
import { historicalStatsForScoring } from '@/scoring/historical-evidence';

type RecalculateOptions = {
  gameId: string;
  playerId: string;
  presetVersion?: string;
  role?: GameStatRole;
  teEligible?: boolean;
  sourceProvider?: string;
  sourceChangeReason?: string;
  reason: string;
};

const statValues = z.record(z.string(), z.number().nullable());

function hash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function recalculateInTransaction(tx: Prisma.TransactionClient, sport: Sport, options: RecalculateOptions) {
  const { gameId, playerId, role: requestedRole, reason } = options;
  const preset = await tx.scoringPreset.findUniqueOrThrow({
    where: { version: options.presetVersion ?? ubpV9.version },
    include: { rules: { orderBy: [{ sport: "asc" }, { statKey: "asc" }] } },
  });
  const existing = await tx.scoreLedger.findUnique({
    where: { gameId_playerId_presetId: { gameId, playerId, presetId: preset.id } },
    include: { entries: { orderBy: { sequence: "desc" }, take: 1, include: { stat: { select: { provider: true } } } } },
  });
  if (existing && requestedRole && existing.role !== requestedRole) {
    throw new Error("A scoring role is already fixed for this athlete, game, and preset.");
  }

  const previousProvider = existing?.entries[0]?.stat.provider;
  const provider = z.string().trim().min(1).max(100).parse(options.sourceProvider ?? previousProvider ?? historicalProvider);
  if (previousProvider && provider !== previousProvider && !options.sourceChangeReason?.trim()) throw new Error("Changing a ledger's source requires an explicit reviewed source change reason.");
  const revisions = await tx.playerGameStat.findMany({
    where: { gameId, playerId, provider, game: { sport } },
    orderBy: { revision: "desc" },
    distinct: ["role"],
    select: { id: true, role: true, normalized: true, observedPositions: true, raw: true },
  });
  const role = chooseRole(revisions.map((revision) => revision.role), existing?.role ?? requestedRole);
  const stat = revisions.find((revision) => revision.role === role);
  if (!stat) throw new Error("The chosen role is missing its box score.");

  const previous = existing?.entries[0];
  if (role !== "FOOTBALL" && options.teEligible !== undefined) throw new Error("TE eligibility applies only to NFL.");
  const override = options.teEligible ?? previous?.teEligibilityOverride ?? null;
  const teEligible = role === "FOOTBALL"
    ? override ?? (stat.observedPositions.length ? stat.observedPositions.includes("TE") : null)
    : null;
  const rules = preset.rules.map(({ sport, statKey, applicability, coefficient }) => ({
    sport, statKey, applicability, coefficientTenths: Number(coefficient.mul(10).toFixed(0)),
  }));
  const ruleHash = hash([preset.version, rules]);
  const originalStats=statValues.parse(stat.normalized);
  const scoringStats=historicalStatsForScoring({provider,role,normalized:originalStats,raw:stat.raw});
  const inputHash = hash([stat.id, engineVersion, ruleHash, role, teEligible, override,...(scoringStats===originalStats?[]:['explicit-shutout-evidence-required'])]);
  if (previous?.inputHash === inputHash) return { ledger: existing, entry: previous, changed: false };

  const result = calculateScore(rules, { role, stats: scoringStats, teEligible });
  const ledger = existing ?? await tx.scoreLedger.create({
    data: { gameId, playerId, presetId: preset.id, role },
  });
  const entry = await tx.scoreLedgerEntry.create({
    data: {
      ...result,
      totalTenths: BigInt(result.totalTenths),
      ledgerId: ledger.id,
      statId: stat.id,
      sequence: (previous?.sequence ?? 0) + 1,
      previousEntryId: previous?.id,
      reason: options.sourceChangeReason ? `${reason}; source review: ${options.sourceChangeReason}` : reason,
      engineVersion,
      inputHash,
      ruleHash,
      teEligible,
      teEligibilityOverride: override,
    },
  });
  return { ledger, entry, changed: true };
}

export async function recalculateScore(options: RecalculateOptions) {
  const database = getDatabase();
  const { sport } = await database.game.findUniqueOrThrow({
    where: { id: options.gameId }, select: { sport: true },
  });
  return database.$transaction(async (tx) => {
    await lockSport(tx, sport);
    return recalculateInTransaction(tx, sport, options);
  }, { timeout: 120_000 });
}

export async function replayCorrectedScores(
  tx: Prisma.TransactionClient,
  sport: Sport,
  pairs: { gameId: string; playerId: string; role: GameStatRole }[],
  reason: string,
) {
  if (!pairs.length) return;
  const ledgers = await tx.scoreLedger.findMany({
    where: { OR: pairs },
    include: { preset: { select: { version: true } } },
  });
  for (const ledger of ledgers) {
    await recalculateInTransaction(tx, sport, {
      gameId: ledger.gameId,
      playerId: ledger.playerId,
      presetVersion: ledger.preset.version,
      reason,
    });
  }
}

export function serializeScoreEntry<T extends { totalTenths: bigint }>(entry: T) {
  return { ...entry, totalTenths: entry.totalTenths.toString(), totalPoints: formatScore(entry.totalTenths) };
}

export async function getLeagueScoreHistory(input: {
  userId: string; leagueId: string; playerId: string; gameId?: string; take: number; skip: number;
}) {
  const database = getDatabase();
  const membership = await database.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
    select: { league: { select: { presetId: true, sports: { select: { sport: true } } } } },
  });
  if (!membership) return null;

  const ledgers = await database.scoreLedger.findMany({
    where: {
      playerId: input.playerId,
      gameId: input.gameId,
      presetId: membership.league.presetId,
      game: { sport: { in: membership.league.sports.map(({ sport }) => sport) } },
    },
    orderBy: [{ game: { gameDate: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      game: { select: { id: true, externalId: true, gameDate: true, sport: true } },
      preset: { select: { version: true, experimental: true } },
      entries: {
        orderBy: { sequence: "desc" },
        select: {
          id: true, sequence: true, reason: true, engineVersion: true, ruleHash: true, inputHash: true,
          totalTenths: true, lineItems: true, missingStats: true, teEligible: true, calculatedAt: true,
          stat: { select: { id: true, revision: true, provider: true, sourceLine: true } },
        },
      },
    },
    skip: input.skip,
    take: input.take + 1,
  });
  return {
    items: ledgers.slice(0, input.take).map((ledger) => ({ ...ledger, entries: ledger.entries.map(serializeScoreEntry) })),
    nextOffset: ledgers.length > input.take ? input.skip + input.take : null,
  };
}
