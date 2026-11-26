import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { financePolicy } from "./finance";
import { makePick } from "./draft";

export function draftJobKey(draft: { id: string; currentPick: number; orderProvenance: string | null }) {
  const generation = draft.orderProvenance?.startsWith("{") ? (JSON.parse(draft.orderProvenance).correctionGeneration ?? 0) : 0;
  return `draft-pick:${draft.id}:${draft.currentPick}${generation ? `:correction-${generation}` : ""}`;
}
export async function draftCorrectionState(tx: Prisma.TransactionClient, pickIds: string[]) {
  const events = pickIds.length ? await tx.commissionerAuditEvent.findMany({ where: { targetType: "DraftPick", targetId: { in: pickIds }, action: { in: ["UNDO_DRAFT_PICK", "RESELECT_DRAFT_PICK"] } } }) : [];
  // The replacement closes an undo of the same generation; a subsequent undo has a larger generation.
  events.sort((a, b) => Number((b.after as { generation: number }).generation) - Number((a.after as { generation: number }).generation) || Number(b.action === "RESELECT_DRAFT_PICK") - Number(a.action === "RESELECT_DRAFT_PICK"));
  const result = new Map<string, typeof events[number]>();
  for (const event of events) if (!result.has(event.targetId)) result.set(event.targetId, event);
  return result;
}
async function undo(tx: Prisma.TransactionClient, userId: string, leagueId: string, draftId: string, reason: string, at: Date) {
  const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can undo draft selections.");
  const draft = await tx.draft.findFirstOrThrow({ where: { id: draftId, leagueId } });
  if (draft.status !== "PAUSED") throw new Error("Pause the in-progress draft before correcting a selection.");
  if (draft.kind !== "INITIAL" || draft.orderProvenance?.includes('"method":"AUCTION"') || (await financePolicy(tx, leagueId))?.salaryMode) throw new Error("This undo control supports unfinished traditional initial snake drafts. Consumed rookie entitlements and settled auction finances cannot be silently reversed.");
  const pick = await tx.draftPick.findUnique({ where: { draftId_overall: { draftId, overall: draft.currentPick - 1 } }, include: { recap: true } });
  if (!pick) throw new Error("No completed selection precedes this draft turn.");
  const pending = await tx.draftPick.findUnique({ where: { draftId_overall: { draftId, overall: draft.currentPick } } });
  if (pending && (await draftCorrectionState(tx, [pending.id])).get(pending.id)?.action === "UNDO_DRAFT_PICK") throw new Error("Replace the already undone selection before undoing another turn.");
  const entry = await tx.rosterEntry.findFirst({ where: { leagueId, teamId: pick.teamId, playerId: pick.playerId, releasedAt: null } });
  if (!entry || entry.lockedAt || await tx.gameLineupSnapshot.count({ where: { rosterEntryId: entry.id } }) || await tx.rosterAssignmentEvent.count({ where: { rosterEntryId: entry.id, fromSlot: { not: null } } })) throw new Error("The selection has downstream ownership, movement or lineup history and cannot be undone.");
  const provenance = draft.orderProvenance?.startsWith("{") ? JSON.parse(draft.orderProvenance) : { method: "SNAKE" };
  const generation = (provenance.correctionGeneration ?? 0) + 1;
  await tx.rosterEntry.update({ where: { id: entry.id }, data: { releasedAt: at } });
  await tx.rosterAssignmentEvent.create({ data: { leagueId, teamId: pick.teamId, rosterEntryId: entry.id, actorUserId: userId, fromSlot: entry.slot, fromSlotIndex: entry.slotIndex, toSlot: "RELEASED", toSlotIndex: 1, effectiveAt: at, reason: `Audited draft undo: ${reason}`, idempotencyKey: `draft-undo:${draftId}:${generation}` } });
  await tx.draft.update({ where: { id: draftId }, data: { currentPick: pick.overall, orderProvenance: JSON.stringify({ ...provenance, correctionGeneration: generation }), pausedRemainingMs: draft.secondsPerPick * 1000, pickDeadlineAt: null, version: { increment: 1 } } });
  return tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "UNDO_DRAFT_PICK", targetType: "DraftPick", targetId: pick.id, sport: draft.sport, before: { playerId: pick.playerId, teamId: pick.teamId, overall: pick.overall, originalSnapshot: JSON.parse(JSON.stringify(pick.recap)) }, after: { void: true, draftId, generation }, effectiveAt: at, reason } });
}
export async function undoLastDraftSelection(userId: string, leagueId: string, draftId: string, reason: string, at = new Date()) {
  z.string().trim().min(10).max(1000).parse(reason);
  return getDatabase().$transaction((tx) => undo(tx, userId, leagueId, draftId, reason, at), { isolationLevel: "Serializable" });
}
export async function correctLastDraftSelection(userId: string, leagueId: string, draftId: string, playerId: string, reason: string, at = new Date()) {
  z.uuid().parse(playerId); z.string().trim().min(10).max(1000).parse(reason);
  return getDatabase().$transaction(async (tx) => {
    await undo(tx, userId, leagueId, draftId, reason, at);
    await tx.draft.update({ where: { id: draftId }, data: { status: "ACTIVE" } });
    const pick = await makePick({ userId, draftId, playerId, automatic: true, now: at }, tx);
    await tx.draft.update({ where: { id: draftId }, data: { status: "PAUSED", pickDeadlineAt: null, pausedRemainingMs: (await tx.draft.findUniqueOrThrow({ where: { id: draftId } })).secondsPerPick * 1000 } });
    return tx.draftPick.update({ where: { id: pick.id }, data: { automatic: false } });
  }, { isolationLevel: "Serializable" });
}
