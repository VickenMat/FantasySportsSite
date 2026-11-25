import { getDatabase } from "@/lib/db";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { linearRookieSlots, weightedRookieOrder } from "./rookie-order";
import { assertRookieDraftWindow } from "./rookies";

const futureSeasonCount = 3;
const rookieRounds = 4;

export async function extendFutureDraftPicks(tx: Prisma.TransactionClient, leagueSportId: string, startYear: number, teamIds: string[]) {
  const grants = Array.from({ length: futureSeasonCount }, (_, index) => startYear + index + 1).flatMap((seasonStartYear) =>
    Array.from({ length: rookieRounds }, (_, index) => index + 1).flatMap((round) => teamIds.map((id) => ({
      leagueSportId, seasonStartYear, round, originalTeamId: id, ownerTeamId: id,
    }))));
  const picks = await tx.futureDraftPick.createManyAndReturn({ data: grants, skipDuplicates: true, select: { id: true, ownerTeamId: true } });
  if (picks.length) await tx.futureDraftPickOwnership.createMany({ data: picks.map((pick) => ({ pickId: pick.id, ownerTeamId: pick.ownerTeamId,
    reason: "Original rookie draft entitlement", idempotencyKey: `future-pick-grant:${pick.id}` })) });
  return { created: picks.length };
}

export function provisionFutureDraftPicks(userId: string, leagueId: string, leagueSportId: string) {
  return getDatabase().$transaction(async (tx) => {
    const sport = await tx.leagueSport.findFirstOrThrow({
      where: { id: leagueSportId, leagueId },
      include: {
        season: { select: { startYear: true } },
        league: { include: { members: { where: { userId } }, teams: { select: { id: true } } } },
      },
    });
    if (sport.league.members[0]?.role !== "COMMISSIONER") throw new Error("Only the commissioner can provision future picks.");
    if (sport.league.format === "REDRAFT") throw new Error("Redraft leagues cannot grant future picks.");
    if (sport.league.status === "SETUP") throw new Error("Finalize league setup before granting future picks.");
    return extendFutureDraftPicks(tx, leagueSportId, sport.season.startYear, sport.league.teams.map(({ id }) => id));
  }, { isolationLevel: "Serializable" });
}

export async function listFutureDraftPicks(userId: string, leagueId: string, leagueSportId: string, includeCurrent = false) {
  const database = getDatabase();
  const sport = await database.leagueSport.findFirstOrThrow({
    where: { id: leagueSportId, leagueId, league: { format: "DYNASTY", members: { some: { userId } } } },
    select: { season: { select: { startYear: true } } },
  });
  const [picks, drafts] = await Promise.all([database.futureDraftPick.findMany({
    where: { leagueSportId, seasonStartYear: {
      ...(includeCurrent ? { gte: sport.season.startYear } : { gt: sport.season.startYear }), lte: sport.season.startYear + futureSeasonCount,
    } },
    include: { originalTeam: { select: { name: true } }, ownerTeam: { select: { name: true } }, ownership: { orderBy: { recordedAt: "asc" } } },
    orderBy: [{ seasonStartYear: "asc" }, { round: "asc" }, { originalTeam: { name: "asc" } }],
  }), database.draft.findMany({ where: { leagueSportId, kind: "ROOKIE" }, include: { season: { select: { startYear: true } } } })]);
  return picks.map((pick) => {
    const draft = drafts.find(({ season }) => season.startYear === pick.seasonStartYear);
    const state = pick.ownership.some(({ idempotencyKey }) => idempotencyKey === consumptionKey(pick.id)) ? "CONSUMED"
      : draft?.status === "COMPLETE" ? "EXPIRED" : draft && pick.round > draft.rounds ? "INACTIVE" : "AVAILABLE";
    return { ...pick, state };
  });
}

export const consumptionKey = (pickId: string) => `future-pick-consume:${pickId}`;

/** Explicit commissioner correction. Negotiated transfers are settled by the trade service. */
export async function transferFuturePick(userId: string, leagueId: string, pickId: string, ownerTeamId: string, reason: string) {
  z.string().trim().min(5).max(1000).parse(reason);
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can correct pick ownership.");
    const pick = await tx.futureDraftPick.findFirstOrThrow({ where: { id: pickId, leagueSport: { leagueId, league: { format: "DYNASTY" } } } });
    const owner = await tx.fantasyTeam.findFirstOrThrow({ where: { id: ownerTeamId, leagueId } });
    if (await tx.futureDraftPickOwnership.findUnique({ where: { idempotencyKey: consumptionKey(pickId) } })) throw new Error("A consumed future pick cannot be transferred.");
    if (pick.ownerTeamId === owner.id) return pick;
    const draft = await tx.draft.findFirst({ where: { leagueSportId: pick.leagueSportId, kind: "ROOKIE", season: { startYear: pick.seasonStartYear } } });
    if (draft) {
      const snapshot = JSON.parse(draft.orderProvenance ?? "null") as RookieSnapshot | null;
      const index = snapshot?.slots.findIndex((slot) => slot.futurePickId === pickId) ?? -1;
      if (!snapshot || index < 0 || index < draft.currentPick - 1 || draft.status === "COMPLETE") throw new Error("The draft selection is no longer transferable.");
      const pickOrder = [...draft.pickOrder]; pickOrder[index] = owner.id;
      await tx.draft.update({ where: { id: draft.id }, data: { pickOrder, version: { increment: 1 } } });
    }
    const updated = await tx.futureDraftPick.update({ where: { id: pickId }, data: { ownerTeamId } });
    await tx.futureDraftPickOwnership.create({ data: { pickId, ownerTeamId, reason,
      idempotencyKey: `future-pick-transfer:${crypto.randomUUID()}` } });
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "CORRECT_FUTURE_PICK_OWNER", targetType: "FutureDraftPick", targetId: pickId,
      before: { ownerTeamId: pick.ownerTeamId }, after: { ownerTeamId }, reason } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

export type RookieSnapshot = { method: "LINEAR_ROOKIE"; slots: { futurePickId: string; originalTeamId: string; round: number; roundPick: number }[]; orderSource: string };

export async function createRookieDraft(userId: string, leagueId: string, leagueSportId: string, options: {
  rounds?: number; manualOrder?: string[]; reason?: string;
  lottery?: { weights: { teamId: string; weight: number }[]; selectedPositions: number };
} = {}) {
  return getDatabase().$transaction(async (tx) => {
    const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: leagueSportId, leagueId }, include: { season: true, league: { include: { teams: true, members: { where: { userId } } } } } });
    if (sport.league.members[0]?.role !== "COMMISSIONER") throw new Error("Only the commissioner can start rookie drafts.");
    if (sport.league.format !== "DYNASTY") throw new Error("Rookie picks require traditional dynasty.");
    const existing = await tx.draft.findUnique({ where: { leagueSportId_seasonId_kind: { leagueSportId, seasonId: sport.seasonId, kind: "ROOKIE" } } });
    if (existing) return existing; // Persisted lottery results are never rerolled.
    if (sport.league.teams.length !== sport.league.maxTeams) throw new Error("Fill all franchise slots before drafting.");
    if (await tx.draft.count({ where: { leagueSportId, status: { in: ["ACTIVE", "PAUSED", "SCHEDULED"] } } })) throw new Error("Finish the other sport draft first.");
    const now = new Date();
    await assertRookieDraftWindow(tx, leagueId, sport.seasonId, now);
    const teamIds = sport.league.teams.map(({ id }) => id);
    const previous = await tx.sportCompetition.findFirst({ where: { leagueSportSeason: { leagueSportId, season: { startYear: { lt: sport.season.startYear } } }, status: "FINALIZED" },
      orderBy: { leagueSportSeason: { season: { startYear: "desc" } } }, include: { placements: { orderBy: { placement: "desc" } } } });
    let order = previous?.placements.map(({ teamId }) => teamId) ?? [];
    let orderSource = "REVERSE_FINAL_PLACEMENT";
    let lotteryResult: ReturnType<typeof weightedRookieOrder> | null = null;
    if (options.manualOrder) {
      z.string().trim().min(5).parse(options.reason);
      if (options.lottery) throw new Error("Choose manual ordering or a lottery.");
      order = options.manualOrder; orderSource = "COMMISSIONER_MANUAL";
    } else if (options.lottery) {
      if (!previous || options.lottery.weights.some(({ teamId }) => !previous.placements.some((row) => row.teamId === teamId && !row.qualifiedForPlayoffs)) ||
        options.lottery.weights.length !== previous.placements.filter(({ qualifiedForPlayoffs }) => !qualifiedForPlayoffs).length) throw new Error("The lottery must contain all and only non-playoff franchises with final placements.");
      lotteryResult = weightedRookieOrder({ reversePlacement: order, nonPlayoff: options.lottery.weights, selectedPositions: options.lottery.selectedPositions });
      order = lotteryResult.order; orderSource = "CONFIGURED_WEIGHTED_LOTTERY";
    }
    if (order.length !== teamIds.length || new Set(order).size !== teamIds.length || order.some((id) => !teamIds.includes(id))) throw new Error("PENDING_DATA: finalized previous placements or an explicit complete manual order are required.");
    const slots = linearRookieSlots(order, options.rounds ?? rookieRounds);
    const picks = await tx.futureDraftPick.findMany({ where: { leagueSportId, seasonStartYear: sport.season.startYear } });
    const snapshot: RookieSnapshot = { method: "LINEAR_ROOKIE", orderSource, slots: slots.map((slot) => {
      const pick = picks.find((pick) => pick.round === slot.round && pick.originalTeamId === slot.originalTeamId);
      if (!pick) throw new Error("Current-season rookie pick inventory is incomplete. Provision the prior season's entitlements first.");
      return { ...slot, futurePickId: pick.id };
    }) };
    if (await tx.futureDraftPickOwnership.count({ where: { idempotencyKey: { in: snapshot.slots.map(({ futurePickId }) => consumptionKey(futurePickId)) } } })) throw new Error("A rookie entitlement has already been consumed.");
    const draft = await tx.draft.create({ data: { leagueId, leagueSportId, seasonId: sport.seasonId, sport: sport.sport, kind: "ROOKIE", status: "ACTIVE", rounds: options.rounds ?? rookieRounds,
      order, pickOrder: snapshot.slots.map(({ futurePickId }) => picks.find(({ id }) => id === futurePickId)!.ownerTeamId),
      orderProvenance: JSON.stringify({ ...snapshot, lottery: options.lottery ?? null, lotteryResult }),
      secondsPerPick: sport.draftSecondsPerPick, startedAt: now, pickStartedAt: now, pickDeadlineAt: new Date(+now + sport.draftSecondsPerPick * 1000) } });
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "START_ROOKIE_DRAFT", targetType: "Draft", targetId: draft.id, sport: sport.sport,
      before: {}, after: { ...snapshot, lottery: options.lottery ?? null, lotteryResult }, reason: options.reason ?? "Reverse finalized sport placement rookie draft" } });
    return draft;
  }, { isolationLevel: "Serializable" });
}
