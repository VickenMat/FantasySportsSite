import { gameLockReview } from './game-lock-review';
import { professionalGamePlayers } from './professional-game-players';
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { PlayerAvailabilityDesignation } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { slotRule } from "@/simulation/config";
import { getEligiblePositions } from "./positions";
import { professionalGameProjection } from "./professional-game-state";

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

export const NON_STARTER_SLOTS = new Set(["BENCH", "IR", "UNIVERSAL_BENCH", "UNIVERSAL_IR", "ROOKIE_OVERFLOW"]);

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function recordAvailabilityEvidence(input: z.input<typeof availabilityInput>, transaction?: Prisma.TransactionClient) {
  const parsed = availabilityInput.parse(input);
  if (parsed.knownAt < parsed.effectiveAt) throw new Error("Availability evidence cannot be known before it became effective.");
  if (parsed.expiresAt && parsed.expiresAt <= parsed.effectiveAt) throw new Error("Availability evidence must expire after it becomes effective.");
  const database = getDatabase();
  const work = async (tx: Prisma.TransactionClient) => {
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
  };
  return transaction ? work(transaction) : database.$transaction(work);
}

export async function captureGameLineups(gameId: string, now = new Date()) {
  const database = getDatabase();
  const [game] = await database.$queryRaw<{id:string;startsAt:Date|null;lockReviewPending:boolean|null;sport:import("@/generated/prisma/enums").Sport}[]>`SELECT game.id, game.sport, source_state."lockReviewPending", source_start."resolvedStart" AS "startsAt" FROM "Game" game ${professionalGameProjection(now)} WHERE game.id=${gameId}::uuid`;
  if(game?.lockReviewPending)return{status:"PENDING_REVIEW" as const,created:0,reason:"Late earlier-start evidence quarantined affected assignments; immutable starter history requires audited review."};
  if (!game?.startsAt) return { status: "PENDING_DATA" as const, created: 0, reason: "The game has no supported exact, scheduled or observed operational lock boundary." };
  if (game.startsAt > now) return { status: "NOT_STARTED" as const, created: 0 };
  if (await database.gameLineupSnapshot.findFirst({ where: { gameId, lockedAt: { not: game.startsAt } }, select: { id: true } })) return { status: "PENDING_REVIEW" as const, created: 0, reason: "Verified start evidence conflicts with an existing immutable lineup lock." };

  const assignments = await database.competitionPeriodGame.findMany({
    where: { gameId },
    include: {
      scoringPeriod: { select: { id: true } },
      sportCompetition: { include: { leagueSportSeason: { include: { leagueSport: true, season: true } } } },
    },
  });
  if (!assignments.length) return { status: "UNASSIGNED" as const, created: 0 };

  const linked = await professionalGamePlayers(database,gameId,game.startsAt);
  const playerEvidence = new Map<string,(typeof linked.availability)[number]>();
  for(const evidence of linked.availability)if(!playerEvidence.has(evidence.playerId))playerEvidence.set(evidence.playerId,evidence);
  if(!linked.links.size)return{status:"PENDING_DATA" as const,created:0,reason:"No canonical player/game or valid professional-team link is available."};
  const review=await database.$transaction(tx=>gameLockReview(tx,gameId,game.startsAt!,now,[...linked.links.keys()],true),{isolationLevel:"Serializable"});
  if(review.pending)return{status:"PENDING_REVIEW" as const,created:0,reason:"Initial capture quarantined post-lock assignment changes for commissioner audit.",review};

  let created = 0;
  for (const assignment of assignments) {
    const competition = assignment.sportCompetition;
    const entries = await database.rosterEntry.findMany({
      where: {
        leagueId: competition.leagueId, sport: game.sport, playerId: { in: [...linked.links.keys()] }, acquiredAt: { lte: game.startsAt },
        OR: [{ releasedAt: null }, { releasedAt: { gt: game.startsAt } }],
      },
      include: { assignmentEvents: { where: { effectiveAt: { lte: game.startsAt } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 } },
    });
    const rows = [];
    for (const entry of entries) {
      const event = entry.assignmentEvents[0];
      if (!event) continue;
      const positions = await getEligiblePositions({
        playerId: entry.playerId, sport: game.sport, seasonYear: competition.leagueSportSeason.season.startYear, asOf: game.startsAt,
      });
      const isStarter = !NON_STARTER_SLOTS.has(event.toSlot) && event.toSlot !== "RELEASED";
      const eligible = isStarter && positions.available
        && (slotRule(game.sport, event.toSlot)?.positions.some((position) => positions.positions.includes(position)) ?? false);
      const source = {
        rosterEntryId: entry.id, eventId: event.id, evidenceId: playerEvidence.get(entry.playerId)?.id??null, gameLink:linked.links.get(entry.playerId)!, availability:playerEvidence.get(entry.playerId)?.designation??"UNKNOWN",
        gameStartsAt: game.startsAt.toISOString(), slot: event.toSlot, slotIndex: event.toSlotIndex, positions: positions.positions, eligible,
      };
      rows.push({
        leagueId: competition.leagueId, sportCompetitionId: competition.id, scoringPeriodId: assignment.scoringPeriod.id,
        gameId, teamId: event.teamId, rosterEntryId: entry.id, playerId: entry.playerId, slot: event.toSlot,
        slotIndex: event.toSlotIndex, isStarter, lockedAt: game.startsAt,
        eligibility: { available: positions.available, eligible, positions: positions.positions, fieldingCounts: positions.fieldingCounts, availability:{designation:playerEvidence.get(entry.playerId)?.designation??"UNKNOWN",evidenceId:playerEvidence.get(entry.playerId)?.id??null}, gameLink:linked.links.get(entry.playerId)! },
        sourceHash: digest(source),
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
  const games = await getDatabase().$queryRaw<{ id: string }[]>`
    SELECT game.id
    FROM "Game" game
    ${professionalGameProjection(now)}
    WHERE source_start."resolvedStart" <= ${now} AND EXISTS (
      SELECT 1
      FROM "CompetitionPeriodGame" assignment
      JOIN "SportCompetition" competition ON competition.id = assignment."sportCompetitionId"
      JOIN "RosterEntry" roster ON roster."leagueId" = competition."leagueId" AND roster.sport = game.sport
      JOIN LATERAL (
        SELECT event."teamId", event."toSlot", event."toSlotIndex"
        FROM "RosterAssignmentEvent" event
        WHERE event."rosterEntryId" = roster.id AND event."effectiveAt" <= source_start."resolvedStart"
        ORDER BY event."effectiveAt" DESC, event."createdAt" DESC, event.id DESC
        LIMIT 1
      ) event ON true
      WHERE assignment."gameId" = game.id
        AND roster."acquiredAt" <= source_start."resolvedStart"
        AND (roster."releasedAt" IS NULL OR roster."releasedAt" > source_start."resolvedStart")
        AND NOT EXISTS (
          SELECT 1 FROM "GameLineupSnapshot" snapshot
          WHERE snapshot."sportCompetitionId" = competition.id AND snapshot."gameId" = game.id
            AND snapshot."teamId" = event."teamId"
            AND (snapshot."playerId" = roster."playerId"
              OR (snapshot.slot = event."toSlot" AND snapshot."slotIndex" = event."toSlotIndex"))
        )
    )
    ORDER BY source_start."resolvedStart", game.id
    LIMIT 500
  `;
  let created = 0;
  for (const game of games) created += (await captureGameLineups(game.id, now)).created;
  return { games: games.length, created };
}

export function availabilityDesignationAllowsIr(designation: PlayerAvailabilityDesignation, sport?: import("@/generated/prisma/enums").Sport) {
  return designation === "INJURED_RESERVE" || designation === "OUT" || (sport === "NFL" && designation === "SUSPENDED");
}

/** Reconstruct every source-linked owned starter at its safe lock. Missing availability
 * never makes an absent snapshot disappear from finalization requirements. */
export async function pendingGameStarterSnapshots(tx:Prisma.TransactionClient,gameId:string,at:Date){
 const [game]=await tx.$queryRaw<{startsAt:Date|null}[]>`SELECT source_start."resolvedStart" AS "startsAt" FROM "Game" game ${professionalGameProjection(at)} WHERE game.id=${gameId}::uuid`;
 if(!game?.startsAt||game.startsAt>at)return{pending:true,missingRosterEntryIds:[] as string[],reason:"No reached supported operational lock."};
 const linked=await professionalGamePlayers(tx,gameId,game.startsAt);
 const review=await gameLockReview(tx,gameId,game.startsAt,at,[...linked.links.keys()]);
 if(review.pending)return{pending:true,missingRosterEntryIds:review.affectedRosterEntryIds,reason:"Post-lock assignments require audited first-capture resolution.",review};
 const assignments=await tx.competitionPeriodGame.findMany({where:{gameId},select:{sportCompetitionId:true,sportCompetition:{select:{leagueId:true}}}});
 const missing=new Set<string>();let required=0;
 for(const assignment of assignments){
  const entries=await tx.rosterEntry.findMany({where:{leagueId:assignment.sportCompetition.leagueId,playerId:{in:[...linked.links.keys()]},acquiredAt:{lte:game.startsAt},OR:[{releasedAt:null},{releasedAt:{gt:game.startsAt}}]},include:{assignmentEvents:{where:{effectiveAt:{lte:game.startsAt}},orderBy:[{effectiveAt:"desc"},{createdAt:"desc"},{id:"desc"}],take:1}}});
  const snapshots=await tx.gameLineupSnapshot.findMany({where:{gameId,sportCompetitionId:assignment.sportCompetitionId},select:{rosterEntryId:true,lockedAt:true,isStarter:true}});
  for(const entry of entries){const event=entry.assignmentEvents[0];if(!event||NON_STARTER_SLOTS.has(event.toSlot)||event.toSlot==='RELEASED')continue;required++;if(!snapshots.some(snapshot=>snapshot.rosterEntryId===entry.id&&snapshot.isStarter&&snapshot.lockedAt.getTime()===game.startsAt!.getTime()))missing.add(entry.id);}
 }
 return{pending:missing.size>0,missingRosterEntryIds:[...missing],requiredStarters:required,reason:missing.size?"Source-linked owned starters lack immutable snapshots at the operational lock.":null};
}
