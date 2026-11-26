import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { availableCap, currency, loweredFloor, releasePenalty } from "@/finance/rules";
import { hasGameplayTable } from "./gameplay-storage";

type Tx = Prisma.TransactionClient;
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  return JSON.stringify(value);
}
export async function financePolicy(tx: Tx, leagueId: string) {
  return await hasGameplayTable("LeagueFinancePolicy", tx) ? tx.leagueFinancePolicy.findUnique({ where: { leagueId } }) : null;
}
export async function configureFinancePolicy(userId: string, leagueId: string, input: { salaryMode: boolean; scope: "SPORT" | "UNIVERSAL"; amount?: number }) {
  if (!await hasGameplayTable("LeagueFinancePolicy")) throw new Error("Financial mechanisms await approval and deployment of the prepared additive migration.");
  const amount = input.amount ?? (input.salaryMode ? input.scope === "SPORT" ? 400 : 500 : undefined);
  z.number().int().min(1).max(1_000_000).parse(amount);
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can configure auction finances.");
    if (member.league.status !== "SETUP") throw new Error("Configure financial format during league setup; existing leagues are not automatically converted.");
    if (input.salaryMode && member.league.format !== "DYNASTY") throw new Error("Salary caps require salary dynasty.");
    if (input.salaryMode && await tx.futureDraftPick.count({ where: { leagueSport: { leagueId } } })) throw new Error("Existing future-pick inventory prevents conversion to salary dynasty. Historical assets will not be discarded.");
    if (await tx.rosterEntry.count({ where: { leagueId, releasedAt: null } })) throw new Error("Existing players require reviewed salary provenance before financial conversion.");
    const existing = await tx.leagueFinancePolicy.findUnique({ where: { leagueId } });
    if (existing && await tx.financeAccount.count({ where: { leagueId } })) throw new Error("Financial settings are locked after accounts have opened.");
    const policy = await tx.leagueFinancePolicy.upsert({ where: { leagueId }, create: { leagueId, ...input, amount: amount! }, update: { ...input, amount: amount! } });
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "CONFIGURE_FINANCIAL_FORMAT", targetType: "League", targetId: leagueId,
      before: existing ?? {}, after: policy, reason: "Explicit auction budget and salary format configuration; contracts remain inactive" } });
    return policy;
  }, { isolationLevel: "Serializable" });
}
export async function accountForAcquisition(tx: Tx, leagueSportId: string, teamId: string, draftId?: string | null) {
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: leagueSportId } });
  const team = await tx.fantasyTeam.findFirstOrThrow({ where: { id: teamId, leagueId: sport.leagueId } });
  const policy = await financePolicy(tx, sport.leagueId);
  if (!policy) throw new Error("Configure an explicit auction budget or salary cap first.");
  const assignment = await tx.leagueSportSeason.findUniqueOrThrow({ where: { leagueSportId_seasonId: { leagueSportId, seasonId: sport.seasonId } } });
  const kind = policy.salaryMode ? "SALARY" : "DRAFT";
  if (kind === "DRAFT" && !draftId) throw new Error("Traditional auction budgets are only used in their draft.");
  const scopeKey = kind === "DRAFT" ? `DRAFT:${draftId}` : policy.scope === "UNIVERSAL" ? `UNIVERSAL:${assignment.championshipCycleId}` : `SPORT:${sport.id}:${sport.seasonId}`;
  const identity = { teamId: team.id, kind, scopeKey };
  const previous = await tx.financeAccount.findUnique({ where: { teamId_kind_scopeKey: identity } });
  if (previous) { if (previous.status !== "ACTIVE") throw new Error("This financial scope has expired."); return previous; }
  const account = await tx.financeAccount.create({ data: { ...identity, leagueId: sport.leagueId, leagueSportId: policy.scope === "SPORT" ? sport.id : null,
    seasonId: policy.scope === "SPORT" ? sport.seasonId : null, cycleId: assignment.championshipCycleId, baseCap: policy.amount } });
  await tx.financeLedgerEntry.create({ data: { accountId: account.id, type: "OPENING", capDelta: account.baseCap, availableAfter: account.baseCap,
    idempotencyKey: `finance-opening:${account.id}`, metadata: { scopeKey, kind, contractsActive: false } } });
  return account;
}
export async function bookFinance(tx: Tx, accountId: string, key: string, type: string,
  delta: { cap?: number; payroll?: number; dead?: number; reserved?: number }, metadata: Prisma.InputJsonValue, solvent = true) {
  const prior = await tx.financeLedgerEntry.findUnique({ where: { idempotencyKey: key } });
  if (prior) {
    if (prior.accountId !== accountId || prior.type !== type || prior.capDelta !== (delta.cap ?? 0) || prior.payrollDelta !== (delta.payroll ?? 0) || prior.deadDelta !== (delta.dead ?? 0) || prior.reservedDelta !== (delta.reserved ?? 0) || stableJson(prior.metadata) !== stableJson(metadata)) throw new Error("Financial idempotency key was reused for a different operation.");
    return tx.financeAccount.findUniqueOrThrow({ where: { id: accountId } });
  }
  const account = await tx.financeAccount.findUniqueOrThrow({ where: { id: accountId } });
  const next = { ...account, capAdjustment: account.capAdjustment + (delta.cap ?? 0), payroll: account.payroll + (delta.payroll ?? 0), deadCap: account.deadCap + (delta.dead ?? 0), reserved: account.reserved + (delta.reserved ?? 0) };
  currency(next.payroll); currency(next.deadCap); currency(next.reserved);
  if (solvent && availableCap(next) < 0) throw new Error("Insufficient unreserved cap or draft budget.");
  const updated = await tx.financeAccount.update({ where: { id: accountId }, data: { capAdjustment: next.capAdjustment, payroll: next.payroll, deadCap: next.deadCap, reserved: next.reserved } });
  await tx.financeLedgerEntry.create({ data: { accountId, type, capDelta: delta.cap ?? 0, payrollDelta: delta.payroll ?? 0, deadDelta: delta.dead ?? 0, reservedDelta: delta.reserved ?? 0,
    availableAfter: availableCap(updated), idempotencyKey: key, metadata } });
  return updated;
}
export async function salaryCompliance(tx: Tx, teamId: string) {
  if (!await hasGameplayTable("FinanceAccount", tx)) return { compliant: true, reasons: [] as string[], excess: 0 };
  const accounts = await tx.financeAccount.findMany({ where: { teamId, kind: "SALARY", status: "ACTIVE" } });
  const reasons = accounts.filter((account) => availableCap(account) < 0).map((account) => `Salary cap ${account.scopeKey} is over by ${-availableCap(account)}. Cut players to restore compliance.`);
  return { compliant: reasons.length === 0, reasons, excess: accounts.reduce((sum, account) => sum + Math.max(0, -availableCap(account)), 0) };
}
export async function selfReacquisitionCredit(tx: Tx, accountId: string, playerId: string, at: Date) {
  const account = await tx.financeAccount.findUniqueOrThrow({ where: { id: accountId } });
  const last = await tx.deadCapObligation.findFirst({ where: { playerId, account: { teamId: account.teamId, leagueId: account.leagueId } }, orderBy: { releasedAt: "desc" } });
  if (last && +last.releasedAt + 7 * 86400000 > +at) throw new Error("The releasing franchise must wait seven days before self-reacquisition.");
  return (await tx.deadCapObligation.findFirst({ where: { accountId, playerId, clearedAt: null } }))?.amount ?? 0;
}
export async function releaseSalary(tx: Tx, leagueId: string, playerId: string, teamId: string, at: Date) {
  if (!(await financePolicy(tx, leagueId))?.salaryMode) return;
  const salary = await tx.playerSalary.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId, playerId } } });
  if (salary.teamId !== teamId) throw new Error("Salary ownership does not match the releasing franchise.");
  if (!salary.active) return;
  const penalty = releasePenalty(salary.amount);
  const old = await tx.deadCapObligation.findFirst({ where: { accountId: salary.accountId, playerId, clearedAt: null } });
  if (old) await tx.deadCapObligation.update({ where: { id: old.id }, data: { clearedAt: at } });
  await tx.deadCapObligation.create({ data: { accountId: salary.accountId, playerId, amount: penalty, releaseSalary: salary.amount, releasedAt: at } });
  const floor = await tx.releasedPlayerFloor.findUnique({ where: { leagueId_playerId: { leagueId, playerId } } });
  const amount = loweredFloor(floor?.amount ?? null, penalty);
  await tx.releasedPlayerFloor.upsert({ where: { leagueId_playerId: { leagueId, playerId } }, create: { leagueId, playerId, amount }, update: { amount } });
  await bookFinance(tx, salary.accountId, `salary-release:${salary.id}:${salary.version}`, "RELEASE", { payroll: -salary.amount, dead: penalty - (old?.amount ?? 0) },
    { playerId, teamId, salary: salary.amount, penalty, previousFloor: floor?.amount ?? null, floor: amount, releasedAt: at.toISOString() }, false);
  await tx.playerSalary.update({ where: { id: salary.id }, data: { active: false, version: { increment: 1 } } });
}
export async function clearPlayerDeadCap(tx: Tx, leagueId: string, playerId: string, key: string, at: Date) {
  const obligations = await tx.deadCapObligation.findMany({ where: { playerId, clearedAt: null, account: { leagueId } }, orderBy: { accountId: "asc" } });
  for (const row of obligations) {
    await bookFinance(tx, row.accountId, `${key}:clear:${row.id}`, "DEAD_CAP_CLEAR", { dead: -row.amount }, { playerId, obligationId: row.id }, false);
    await tx.deadCapObligation.update({ where: { id: row.id }, data: { clearedAt: at } });
  }
}
export async function transferCurrentCap(tx: Tx, fromAccountId: string, toAccountId: string, amount: number, key: string = randomUUID(), at = new Date()) {
  currency(amount, 1);
  const [from, to] = await Promise.all([tx.financeAccount.findUniqueOrThrow({ where: { id: fromAccountId } }), tx.financeAccount.findUniqueOrThrow({ where: { id: toAccountId } })]);
  const metadata = { fromAccountId, toAccountId, amount, scopeKey: from.scopeKey };
  if (await tx.financeLedgerEntry.findUnique({ where: { idempotencyKey: `cap-transfer:${key}:out` } })) {
    await bookFinance(tx, from.id, `cap-transfer:${key}:out`, "CAP_TRANSFER", { cap: -amount }, metadata);
    await bookFinance(tx, to.id, `cap-transfer:${key}:in`, "CAP_TRANSFER", { cap: amount }, metadata, false);
    return;
  }
  if (from.id === to.id || from.leagueId !== to.leagueId || from.scopeKey !== to.scopeKey || from.kind !== "SALARY" || to.kind !== "SALARY" || from.status !== "ACTIVE" || to.status !== "ACTIVE") throw new Error("Cap transfers require distinct franchises in the same current salary scope.");
  if (from.leagueSportId) {
    const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: from.leagueSportId } });
    if (sport.seasonId !== from.seasonId) throw new Error("Future or expired sport cap cannot be transferred.");
    const assignment = await tx.leagueSportSeason.findUniqueOrThrow({ where: { leagueSportId_seasonId: { leagueSportId: sport.id, seasonId: sport.seasonId } } });
    if (!assignment.tradeDeadlineAt || at >= assignment.tradeDeadlineAt) throw new Error("Sport cap transfer deadline has passed or remains PENDING_DATA.");
  } else {
    const cycle = await tx.championshipCycle.findUniqueOrThrow({ where: { id: from.cycleId! } });
    if (cycle.status === "COMPLETE") throw new Error("Universal cap transfers expire at their championship-cycle boundary.");
    const assignments = await tx.leagueSportSeason.findMany({ where: { championshipCycleId: cycle.id }, include: { leagueSport: true } });
    if (!assignments.some((assignment) => assignment.seasonId === assignment.leagueSport.seasonId)) throw new Error("Future or expired universal cycle cap cannot be transferred.");
  }
  await bookFinance(tx, from.id, `cap-transfer:${key}:out`, "CAP_TRANSFER", { cap: -amount }, metadata);
  await bookFinance(tx, to.id, `cap-transfer:${key}:in`, "CAP_TRANSFER", { cap: amount }, metadata, false);
}
