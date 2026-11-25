import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { PlayerAvailabilityDesignation } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { getEligiblePositions } from "./positions";

const availabilityInput = z.object({
  playerId: z.uuid(),
  gameId: z.uuid().nullable().optional(),
  designation: z.enum(["ACTIVE", "QUESTIONABLE", "DOUBTFUL", "OUT", "INJURED_RESERVE", "SUSPENDED", "RETIRED", "UNKNOWN"]),
  irEligible: z.boolean(),
  effectiveAt: z.date(),
  knownAt: z.date(),
  expiresAt: z.date().nullable().optional(),
  provider: z.string().trim().min(1).max(100),
  externalId: z.string().trim().min(1).max(200),
  sourceRecord: z.record(z.string(), z.unknown()),
});

export const NON_STARTER_SLOTS = new Set(["BENCH", "IR", "UNIVERSAL_BENCH", "UNIVERSAL_IR"]);

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function recordAvailabilityEvidence(input: z.input<typeof availabilityInput>) {
  const parsed = availabilityInput.parse(input);
  if (parsed.knownAt < parsed.effectiveAt) throw new Error("Availability evidence cannot be known before it became effective.");
  if (parsed.expiresAt && parsed.expiresAt <= parsed.effectiveAt) throw new Error("Availability evidence must expire after it becomes effective.");
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: parsed.playerId }, select: { sport: true } });
    if (parsed.gameId) {
      const game = await tx.game.findUniqueOrThrow({ where: { id: parsed.gameId }, select: { sport: true } });
      if (game.sport !== player.sport) throw new Error("Availability evidence must match the player and game's sport.");
    }
    const key = { provider: parsed.provider, externalId: parsed.externalId };
    const existing = await tx.playerAvailabilityEvidence.findUnique({ where: { provider_externalId: key } });
    if (existing) {
      const same = existing.playerId === parsed.playerId && existing.gameId === (parsed.gameId ?? null) &&
        existing.designation === parsed.designation && existing.irEligible === parsed.irEligible &&
        existing.effectiveAt.getTime() === parsed.effectiveAt.getTime() && existing.knownAt.getTime() === parsed.knownAt.getTime() &&
        (existing.expiresAt?.getTime() ?? null) === (parsed.expiresAt?.getTime() ?? null) && digest(existing.sourceRecord) === digest(parsed.sourceRecord);
      if (!same) throw new Error("Availability evidence already exists with different immutable contents.");
      return existing;
    }
    return tx.playerAvailabilityEvidence.create({ data: { ...parsed, sourceRecord: parsed.sourceRecord as Prisma.InputJsonObject,
      gameId: parsed.gameId ?? null, expiresAt: parsed.expiresAt ?? null } });
  });
}

export async function verifiedIrEvidence(playerId: string, at = new Date()) {
  return getDatabase().playerAvailabilityEvidence.findFirst({
    where: { playerId, irEligible: true, effectiveAt: { lte: at }, knownAt: { lte: at }, OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
    orderBy: [{ effectiveAt: "desc" }, { knownAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function captureGameLineups(gameId: string, now = new Date()) {
  const database = getDatabase();
  const game = await database.game.findUnique({ where: { id: gameId }, select: { id: true, startsAt: true, sport: true } });
  if (!game?.startsAt) return { status: "PENDING_DATA" as const, created: 0, reason: "The game has no verified start timestamp." };
  if (game.startsAt > now) return { status: "NOT_STARTED" as const, created: 0 };

  const assignments = await database.competitionPeriodGame.findMany({
    where: { gameId },
    include: {
      scoringPeriod: { select: { id: true } },
      sportCompetition: { include: { leagueSportSeason: { include: { leagueSport: true, season: true } } } },
    },
  });
  if (!assignments.length) return { status: "UNASSIGNED" as const, created: 0 };

  const evidenceRows = await database.playerAvailabilityEvidence.findMany({
    where: { gameId, knownAt: { lte: game.startsAt }, effectiveAt: { lte: game.startsAt }, OR: [{ expiresAt: null }, { expiresAt: { gt: game.startsAt } }] },
    orderBy: [{ knownAt: "desc" }, { effectiveAt: "desc" }, { createdAt: "desc" }],
  });
  const playerEvidence = new Map<string, (typeof evidenceRows)[number]>();
  for (const evidence of evidenceRows) if (!playerEvidence.has(evidence.playerId)) playerEvidence.set(evidence.playerId, evidence);
  if (!playerEvidence.size) return { status: "PENDING_DATA" as const, created: 0, reason: "No pregame player-game availability evidence is available." };

  let created = 0;
  for (const assignment of assignments) {
    const competition = assignment.sportCompetition;
    const entries = await database.rosterEntry.findMany({
      where: {
        leagueId: competition.leagueId, sport: game.sport, playerId: { in: [...playerEvidence.keys()] }, acquiredAt: { lte: game.startsAt },
        OR: [{ releasedAt: null }, { releasedAt: { gt: game.startsAt } }],
      },
      include: { assignmentEvents: { where: { effectiveAt: { lte: game.startsAt } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1 } },
    });
    const rows = [];
    for (const entry of entries) {
      const event = entry.assignmentEvents[0];
      if (!event) continue;
      const positions = await getEligiblePositions({
        playerId: entry.playerId, sport: game.sport, seasonYear: competition.leagueSportSeason.season.startYear, asOf: game.startsAt,
      });
      const source = {
        rosterEntryId: entry.id, eventId: event.id, evidenceId: playerEvidence.get(entry.playerId)!.id,
        gameStartsAt: game.startsAt.toISOString(), slot: event.toSlot, slotIndex: event.toSlotIndex, positions: positions.positions,
      };
      rows.push({
        leagueId: competition.leagueId, sportCompetitionId: competition.id, scoringPeriodId: assignment.scoringPeriod.id,
        gameId, teamId: entry.teamId, rosterEntryId: entry.id, playerId: entry.playerId, slot: event.toSlot,
        slotIndex: event.toSlotIndex, isStarter: !NON_STARTER_SLOTS.has(event.toSlot), lockedAt: game.startsAt,
        eligibility: { available: positions.available, positions: positions.positions, fieldingCounts: positions.fieldingCounts }, sourceHash: digest(source),
      });
    }
    if (rows.length) {
      const result = await database.gameLineupSnapshot.createMany({ data: rows, skipDuplicates: true });
      created += result.count;
    }
  }
  return { status: "CAPTURED" as const, created };
}

export async function captureDueGameLineups(now = new Date()) {
  const games = await getDatabase().game.findMany({
    where: {
      startsAt: { lte: now }, competitionPeriodGames: { some: {} }, availabilityEvidence: { some: { knownAt: { lte: now } } },
      lineupSnapshots: { none: {} },
    },
    select: { id: true }, orderBy: { startsAt: "asc" }, take: 500,
  });
  let created = 0;
  for (const game of games) created += (await captureGameLineups(game.id, now)).created;
  return { games: games.length, created };
}

export function availabilityDesignationAllowsIr(designation: PlayerAvailabilityDesignation) {
  return designation === "INJURED_RESERVE" || designation === "OUT";
}
