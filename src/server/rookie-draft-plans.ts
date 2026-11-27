import { checkDraftBeforeProfessionalStart } from "./professional-calendar";
import { activeFranchises } from "./franchise-participation";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { createRookieDraft, consumptionKey, type RookieSnapshot } from "./dynasty-picks";
import { hasGameplayTable } from "./gameplay-storage";
import { assertRookieDraftWindow } from "./rookies";
import { currentCompliance } from "./rosters";

const configuration = z.object({ leagueId: z.uuid(), leagueSportId: z.uuid(), rounds: z.number().int().min(1).max(100), scheduledAt: z.coerce.date(), timezone: z.string(), secondsPerPick: z.number().int().min(15).max(600), reason: z.string().trim().min(5).max(1000), expectedVersion: z.number().int().positive().optional() }).strict();
export async function configureRookieDraftPlan(userId: string, raw: z.input<typeof configuration>, at = new Date()) {
  const input = configuration.parse(raw);
  if (input.scheduledAt <= at) throw new Error("Choose a future rookie draft start.");
  new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(at);
  if (!await hasGameplayTable("DraftPlan")) throw new Error("Rookie scheduling requires the reviewed draft-center migration.");
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: input.leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can schedule rookie drafts.");
    const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: input.leagueSportId, leagueId: input.leagueId } });
    const identity = { leagueSportId: sport.id, seasonId: sport.seasonId, kind: "ROOKIE" as const };
    const previous = await tx.draftPlan.findUnique({ where: { leagueSportId_seasonId_kind: identity } });
    if (previous && previous.version !== input.expectedVersion) throw new Error("Rookie configuration changed; refresh before saving.");
    const draft = await createRookieDraft(userId, input.leagueId, sport.id, { rounds: input.rounds, reason: input.reason }, { prepare: true, now: at }, tx);
    if (draft.status !== "SCHEDULED") throw new Error("Rookie configuration is locked after drafting begins.");
    const boundary = await checkDraftBeforeProfessionalStart(tx, { seasonId: sport.seasonId, asOf: at, endsAt: new Date(+input.scheduledAt + draft.pickOrder.length * input.secondsPerPick * 1000) });
    if (boundary.verified && !boundary.allowed) throw new Error(boundary.reason);
    await tx.draft.update({ where: { id: draft.id }, data: { secondsPerPick: input.secondsPerPick } });
    const data = { leagueId: input.leagueId, draftId: draft.id, method: "LINEAR", scope: "SPORT", orderMethod: "REVERSE_FINAL_PLACEMENT", order: draft.order, rounds: input.rounds, secondsPerPick: input.secondsPerPick, scheduledAt: input.scheduledAt, timezone: input.timezone, status: "SCHEDULED", blockedReason: null };
    const plan = await tx.draftPlan.upsert({ where: { leagueSportId_seasonId_kind: identity }, create: { ...identity, ...data }, update: { ...data, version: { increment: 1 } } });
    await tx.commissionerAuditEvent.create({ data: { leagueId: input.leagueId, actorUserId: userId, action: "SCHEDULE_ROOKIE_DRAFT", targetType: "DraftPlan", targetId: plan.id, sport: sport.sport, before: { version: previous?.version ?? null }, after: { version: plan.version, scheduledAt: input.scheduledAt.toISOString(), timezone: input.timezone, orderMethod: data.orderMethod }, reason: input.reason } });
    return plan;
  }, { isolationLevel: "Serializable" });
}

export async function activateScheduledRookieDraft(userId: string, planId: string, at: Date) {
  return getDatabase().$transaction(async (tx) => {
    const plan = await tx.draftPlan.findUniqueOrThrow({ where: { id: planId }, include: { draft: true, leagueSport: { include: { league: { include: { teams: true } } } } } });
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: plan.leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the authorized commissioner worker may activate this rookie plan.");
    if (plan.kind !== "ROOKIE" || plan.method !== "LINEAR" || plan.orderMethod !== "REVERSE_FINAL_PLACEMENT" || !plan.draft || !plan.scheduledAt || plan.scheduledAt > at) throw new Error("A valid linear rookie plan must reach its persisted start before activation.");
    if (plan.draft.status === "ACTIVE") return plan.draft;
    if (plan.draft.status !== "SCHEDULED" || ["CANCELLED", "COMPLETED"].includes(plan.status)) throw new Error("This rookie draft cannot be activated.");
    const sport = plan.leagueSport;
    if (sport.seasonId !== plan.seasonId) throw new Error("The sport's selected season changed before this rookie start.");
    sport.league.teams = await activeFranchises(tx, plan.leagueId, sport.league.teams);
    const ids = sport.league.teams.map(({ id }) => id);
    if (ids.length !== sport.league.maxTeams || ids.length !== plan.order.length || plan.order.some((id) => !ids.includes(id))) throw new Error("Rookie draft participation changed; save a complete configuration before starting.");
    await assertRookieDraftWindow(tx, plan.leagueId, plan.seasonId, at);
    if (!sport.league.isHistorical) {
      const boundary = await checkDraftBeforeProfessionalStart(tx, { seasonId: plan.seasonId, asOf: at, endsAt: new Date(+at + plan.draft.pickOrder.length * plan.secondsPerPick * 1000) });
      if (!boundary.allowed) throw new Error(boundary.reason);
    }
    const snapshot = JSON.parse(plan.draft.orderProvenance!) as RookieSnapshot;
    if (snapshot.method !== "LINEAR_ROOKIE" || snapshot.orderSource !== "REVERSE_FINAL_PLACEMENT") throw new Error("Rookie provenance requires reverse finalized placement.");
    const picks = await tx.futureDraftPick.findMany({ where: { id: { in: snapshot.slots.map(({ futurePickId }) => futurePickId) } } });
    if (picks.length !== snapshot.slots.length || await tx.futureDraftPickOwnership.count({ where: { idempotencyKey: { in: picks.map(({ id }) => consumptionKey(id)) } } })) throw new Error("A prepared rookie entitlement is missing or already consumed.");
    for (const teamId of ids) if ((await currentCompliance(tx, teamId, at)).state !== "COMPLIANT") throw new Error(`Franchise ${teamId} must restore compliance before this rookie draft starts.`);
    const draft = await tx.draft.update({ where: { id: plan.draft.id }, data: { status: "ACTIVE", pickOrder: snapshot.slots.map(({ futurePickId }) => picks.find(({ id }) => id === futurePickId)!.ownerTeamId), startedAt: at, pickStartedAt: at, pickDeadlineAt: new Date(+at + plan.secondsPerPick * 1000), version: { increment: 1 } } });
    await tx.draftPlan.update({ where: { id: plan.id }, data: { status: "IN_PROGRESS", blockedReason: null } });
    await tx.commissionerAuditEvent.create({ data: { leagueId: plan.leagueId, actorUserId: userId, action: "ACTIVATE_ROOKIE_DRAFT", targetType: "Draft", targetId: draft.id, sport: sport.sport, before: { status: "SCHEDULED" }, after: { status: "ACTIVE", startedAt: at.toISOString() }, reason: "Atomic worker activation at the persisted rookie schedule; original reverse-placement slots remain unchanged." } });
    return draft;
  }, { isolationLevel: "Serializable" });
}
