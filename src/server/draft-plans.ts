import { checkDraftBeforeProfessionalStart } from "./professional-calendar";
import { activeFranchises } from "./franchise-participation";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { DraftPlan, Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { buildPickOrder, createDraft } from "./draft";
import { hasGameplayTable } from "./gameplay-storage";
import { runBackgroundJob } from "./background-jobs";
import { setCommissionerAuditContext } from "./commissioner-audit";
import { financePolicy } from "./finance";
import { activateScheduledRookieDraft } from "./rookie-draft-plans";

export function draftRoomState(plan: Pick<DraftPlan, "scheduledAt" | "status">, now: Date) {
  if (["IN_PROGRESS", "PAUSED", "BLOCKED", "COMPLETED", "CANCELLED"].includes(plan.status)) return plan.status;
  if (!plan.scheduledAt) return "UNSCHEDULED";
  return +now >= +plan.scheduledAt ? "AWAITING_START" : +now >= +plan.scheduledAt - 3600000 ? "ROOM_OPEN" : "SCHEDULED";
}
export function testingDraftShortcutAllowed() {
  const name = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : "";
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test" ||
    (name === "fantasy_evolution_test" && (process.env.AUTHORIZED_TEST_DATABASES ?? "").split(",").includes(name));
}
export async function listDraftPlans(leagueId: string) {
  return await hasGameplayTable("DraftPlan") ? getDatabase().draftPlan.findMany({ where: { leagueId }, include: { leagueSport: true, season: true }, orderBy: { createdAt: "desc" } }) : [];
}
const configSchema = z.object({
  leagueId: z.uuid(), leagueSportId: z.uuid(), scheduledAt: z.coerce.date().nullable(), timezone: z.string().min(1),
  method: z.enum(["SNAKE", "AUCTION"]), orderMethod: z.enum(["RANDOM", "CUSTOM"]), order: z.array(z.uuid()),
  scope: z.enum(["SPORT", "UNIVERSAL"]).default("SPORT"),
  rounds: z.number().int().min(1).max(100), secondsPerPick: z.number().int().min(15).max(600),
  regenerate: z.boolean().default(false), expectedVersion: z.number().int().positive().optional(),
});
export async function configureDraftPlan(userId: string, raw: z.input<typeof configSchema>, now = new Date()) {
  const input = configSchema.parse(raw);
  new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(now);
  if (input.scheduledAt && input.scheduledAt <= now) throw new Error("Choose a future scheduled start or use the authorized testing shortcut.");
  if (!await hasGameplayTable("DraftPlan")) throw new Error("Draft scheduling awaits approval and deployment of the additive draft-center migration. Existing records are preserved.");
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: input.leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can configure drafts.");
    const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: input.leagueSportId, leagueId: input.leagueId }, include: { league: { include: { teams: true } } } });
    const policy = await financePolicy(tx, input.leagueId);
    if (await tx.draft.findFirst({ where: { leagueSportId: sport.id, seasonId: sport.seasonId, kind: "ROOKIE", status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } } })) throw new Error("Finish or reschedule the existing rookie draft through its linear rookie controls before configuring another draft.");
    if (policy?.salaryMode && input.method !== "AUCTION") throw new Error("Salary dynasty initial drafts must use auction.");
    if (input.method === "AUCTION" && !policy) throw new Error("Configure an explicit traditional auction budget or salary cap first.");
    if (input.method === "AUCTION" && sport.keeperLimit > 0) throw new Error("Auction drafts cannot use redraft keepers.");
    if (input.scope === "UNIVERSAL") {
      if (sport.sport !== sport.league.primarySport) throw new Error("Configure the universal draft from the league's primary sport draft center.");
      const other = await tx.draftPlan.findFirst({ where: { leagueId: input.leagueId, leagueSportId: { not: sport.id }, status: { not: "CANCELLED" } } });
      if (other) throw new Error("Remove separate sport draft plans before configuring a universal draft.");
      if (input.method === "AUCTION" && !policy?.salaryMode && policy?.scope !== "UNIVERSAL") throw new Error("A traditional universal auction requires an explicit universal auction budget.");
      if (await tx.leagueSport.count({ where: { leagueId: input.leagueId, keeperLimit: { gt: 0 } } })) throw new Error("Universal drafts cannot silently merge sport-specific keeper round costs. Use independent sport keeper drafts.");
    } else if (await tx.draftPlan.findFirst({ where: { leagueId: input.leagueId, scope: "UNIVERSAL", leagueSportId: { not: sport.id }, status: { not: "CANCELLED" } } })) throw new Error("An existing universal draft already covers this sport.");
    const identity = { leagueSportId: sport.id, seasonId: sport.seasonId, kind: "INITIAL" as const };
    const existing = await tx.draftPlan.findUnique({ where: { leagueSportId_seasonId_kind: identity } });
    const draft = await tx.draft.findUnique({ where: { leagueSportId_seasonId_kind: identity } });
    if (draft && draft.status !== "SCHEDULED") throw new Error("Draft configuration is locked after the draft begins.");
    if (existing && input.expectedVersion !== existing.version) throw new Error("Draft configuration changed. Refresh before saving.");
    sport.league.teams = await activeFranchises(tx, input.leagueId, sport.league.teams);
    if (sport.league.teams.length < 2) throw new Error("At least two participating franchises are required.");
    const ids = sport.league.teams.map(({ id }) => id);
    let order = input.order;
    if (input.orderMethod === "RANDOM") {
      order = existing?.orderMethod === "RANDOM" && !input.regenerate ? existing.order : [...ids];
      if (!existing || existing.orderMethod !== "RANDOM" || input.regenerate) for (let index = order.length - 1; index > 0; index--) {
        const target = randomInt(index + 1); [order[index], order[target]] = [order[target], order[index]];
      }
    }
    if (order.length !== ids.length || new Set(order).size !== ids.length || order.some((id) => !ids.includes(id))) throw new Error("Draft order must contain every current franchise exactly once.");
    if (!sport.league.isHistorical && input.scheduledAt) {
      const boundary = await checkDraftBeforeProfessionalStart(tx, { seasonId: sport.seasonId, asOf: now, endsAt: new Date(+input.scheduledAt + input.rounds * ids.length * input.secondsPerPick * 1000) });
      if (boundary.verified && !boundary.allowed) throw new Error(boundary.reason);
    }
    if (input.scope === "UNIVERSAL" && !sport.league.isHistorical && input.scheduledAt) {
      const covered = await tx.leagueSport.findMany({where:{leagueId:input.leagueId}});
      for (const target of covered) {
        const evidence = await checkDraftBeforeProfessionalStart(tx, { seasonId: target.seasonId, asOf: now, endsAt: new Date(+input.scheduledAt + input.rounds * ids.length * input.secondsPerPick * 1000) });
        if (evidence.verified && !evidence.allowed) throw new Error(`The universal draft must finish before the selected ${target.sport} season. ${evidence.reason}`);
      }
    }
    const data = { method: input.method, scope: input.scope, orderMethod: input.orderMethod, order, rounds: input.rounds, secondsPerPick: input.secondsPerPick,
      scheduledAt: input.scheduledAt, timezone: input.timezone, status: input.scheduledAt ? "SCHEDULED" : "UNSCHEDULED", blockedReason: null };
    await setCommissionerAuditContext(tx, userId, "CONFIGURE_DRAFT", "Commissioner saved draft center configuration.");
    await tx.leagueSport.update({ where: { id: sport.id }, data: { draftOrder: order, draftRounds: input.rounds, draftSecondsPerPick: input.secondsPerPick } });
    const plan = await tx.draftPlan.upsert({ where: { leagueSportId_seasonId_kind: identity }, create: { ...identity, leagueId: input.leagueId, ...data }, update: { ...data, version: { increment: 1 } } });
    const roomDraft = await tx.draft.upsert({ where: { leagueSportId_seasonId_kind: identity },
      create: { ...identity, leagueId: input.leagueId, sport: sport.sport, status: "SCHEDULED", rounds: input.rounds, secondsPerPick: input.secondsPerPick, order, pickOrder: buildPickOrder(order, input.rounds) },
      update: { rounds: input.rounds, secondsPerPick: input.secondsPerPick, order, pickOrder: buildPickOrder(order, input.rounds), version: { increment: 1 } } });
    await tx.draftPlan.update({ where: { id: plan.id }, data: { draftId: roomDraft.id } });
    await tx.commissionerAuditEvent.create({ data: { leagueId: input.leagueId, actorUserId: userId, action: "CONFIGURE_DRAFT", targetType: "DraftPlan", targetId: plan.id, sport: sport.sport,
      before: existing ? JSON.parse(JSON.stringify(existing)) : {}, after: JSON.parse(JSON.stringify({ ...data, draftId: roomDraft.id, version: plan.version })),
      reason: input.regenerate ? "Explicit initial draft order regeneration" : "Commissioner saved draft configuration and UTC schedule" } });
    return { ...plan, draftId: roomDraft.id };
  }, { isolationLevel: "Serializable" });
}
export async function assertQueueRoomAccess(tx: Prisma.TransactionClient, draftId: string, now = new Date()) {
  const plan = await hasGameplayTable("DraftPlan", tx) ? await tx.draftPlan.findUnique({ where: { draftId } }) : null;
  if (!plan) {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    if (draft.status === "SCHEDULED") throw new Error("Configure a scheduled start before opening draft preparation.");
    return;
  }
  if (!["ROOM_OPEN", "AWAITING_START", "IN_PROGRESS", "PAUSED", "BLOCKED"].includes(draftRoomState(plan, now))) throw new Error("Draft preparation opens exactly one hour before the scheduled start.");
}
export async function processScheduledDrafts(now = new Date()) {
  if (!await hasGameplayTable("DraftPlan")) return [];
  const db = getDatabase();
  const plans = await db.draftPlan.findMany({ where: { status: { in: ["SCHEDULED", "ROOM_OPEN", "BLOCKED"] }, scheduledAt: { lte: new Date(+now + 3600000) } } });
  const outcomes = [];
  for (const plan of plans) {
    if (plan.scheduledAt! > now) {
      await db.draftPlan.updateMany({ where: { id: plan.id, version: plan.version, status: "SCHEDULED" }, data: { status: "ROOM_OPEN" } }); continue;
    }
    outcomes.push(await runBackgroundJob(`scheduled-draft:${plan.id}:${plan.version}`, "scheduled-draft", async () => {
      const commissioner = await db.leagueMember.findFirstOrThrow({ where: { leagueId: plan.leagueId, role: "COMMISSIONER" } });
      try {
        if (plan.kind === "ROOKIE") await activateScheduledRookieDraft(commissioner.userId, plan.id, now);
        else await createDraft(commissioner.userId, plan.leagueId, undefined, { planId: plan.id, now });
        return true;
      } catch (error) {
        await db.draftPlan.updateMany({ where: { id: plan.id, version: plan.version }, data: { status: "BLOCKED", blockedReason: error instanceof Error ? error.message : "Draft start failed" } });
        throw error;
      }
    }, now));
  }
  return outcomes;
}
