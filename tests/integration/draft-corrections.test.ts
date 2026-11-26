import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { createDraft, makePick, processExpiredDrafts, setDraftPaused } from "@/server/draft";
import { correctLastDraftSelection, draftCorrectionState, draftJobKey, undoLastDraftSelection } from "@/server/draft-corrections";
const db = getDatabase();
afterAll(() => db.$disconnect());
it("atomically corrects and undoes only reversible last snake selections, preserving immutable original evidence and timer recovery", async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(owner.id, { name: `Draft correction fixture ${randomUUID()}`, historical: true, seasonYear: 2086, sports: ["NFL"], maxTeams: 2, fillWithComputers: true });
  const players = await Promise.all([0, 1, 2].map((index) => db.player.create({ data: { sport: "NFL", displayName: `Correction player ${index} ${randomUUID()}`, isDemo: true } })));
  try {
    await db.leagueSport.updateMany({ where: { leagueId: league.id }, data: { draftRounds: 2, draftSecondsPerPick: 30 } });
    const draft = await createDraft(owner.id, league.id, "NFL");
    const first = await makePick({ userId: owner.id, draftId: draft.id, playerId: players[0].id });
    const original = await db.draftSelectionSnapshot.findUniqueOrThrow({ where: { pickId: first.id } });
    await expect(undoLastDraftSelection(owner.id, league.id, draft.id, "Must pause before undo")).rejects.toThrow(/Pause/);
    await setDraftPaused(owner.id, draft.id, true);
    await expect(undoLastDraftSelection(randomUUID(), league.id, draft.id, "Unauthorized correction fixture")).rejects.toThrow(/commissioner/);
    // Invalid replacement rolls the undo, roster release and audit back together.
    await expect(correctLastDraftSelection(owner.id, league.id, draft.id, randomUUID(), "Invalid player correction fixture")).rejects.toThrow();
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).currentPick).toBe(2);
    expect(await db.rosterEntry.count({ where: { leagueId: league.id, releasedAt: null } })).toBe(1);
    expect(await db.commissionerAuditEvent.count({ where: { leagueId: league.id, action: "UNDO_DRAFT_PICK" } })).toBe(0);
    const corrected = await correctLastDraftSelection(owner.id, league.id, draft.id, players[1].id, "Replace mistaken first selection fixture");
    expect(corrected).toMatchObject({ id: first.id, playerId: players[1].id, overall: 1 });
    expect(await db.draftSelectionSnapshot.findUniqueOrThrow({ where: { pickId: first.id } })).toEqual(original);
    expect((await draftCorrectionState(db, [first.id])).get(first.id)?.action).toBe("RESELECT_DRAFT_PICK");
    await undoLastDraftSelection(owner.id, league.id, draft.id, "Undo replacement for verified recovery fixture");
    const undone = await db.draft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(undone).toMatchObject({ status: "PAUSED", currentPick: 1 });
    expect(draftJobKey(undone)).toContain("correction-2");
    expect(await db.rosterEntry.count({ where: { leagueId: league.id, releasedAt: null } })).toBe(0);
    await expect(undoLastDraftSelection(owner.id, league.id, draft.id, "Cannot undo beyond the first selection")).rejects.toThrow(/No completed selection/);
    await setDraftPaused(owner.id, draft.id, false);
    const resumed = await db.draft.findUniqueOrThrow({ where: { id: draft.id } });
    await processExpiredDrafts(resumed.pickDeadlineAt!);
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).currentPick).toBe(2);
    expect((await draftCorrectionState(db, [first.id])).get(first.id)?.action).toBe("RESELECT_DRAFT_PICK");
    expect(await db.rosterAssignmentEvent.count({ where: { leagueId: league.id } })).toBe(5);
    await expect(db.draftSelectionSnapshot.update({ where: { pickId: first.id }, data: { playerName: "Rewritten" } })).rejects.toThrow(/append-only/);
  } finally { await db.league.delete({ where: { id: league.id } }); await db.player.deleteMany({ where: { id: { in: players.map(({ id }) => id) } } }); }
});

it("closes an audited legacy undo even when the original selection predates immutable recap storage", async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(owner.id, { name: `Legacy correction fixture ${randomUUID()}`, historical: true, seasonYear: 2088, sports: ["NFL"], maxTeams: 2, fillWithComputers: true });
  try {
    await db.leagueSport.updateMany({ where: { leagueId: league.id }, data: { draftRounds: 2 } });
    const draft = await createDraft(owner.id, league.id, "NFL");
    const players = await db.player.findMany({ where: { sport: "NFL", isDemo: true }, orderBy: { id: "asc" }, take: 2 });
    const roster = await db.fantasyRoster.findFirstOrThrow({ where: { teamId: draft.order[0], sport: "NFL" } });
    const pick = await db.draftPick.create({ data: { draftId: draft.id, teamId: roster.teamId, playerId: players[0].id, overall: 1, round: 1, roundPick: 1 } });
    await db.rosterEntry.create({ data: { leagueId: league.id, rosterId: roster.id, teamId: roster.teamId, playerId: players[0].id, sport: "NFL", seasonId: draft.seasonId, slot: "BENCH" } });
    await db.draft.update({ where: { id: draft.id }, data: { currentPick: 2 } });
    await setDraftPaused(owner.id, draft.id, true);
    expect(await db.draftSelectionSnapshot.findUnique({ where: { pickId: pick.id } })).toBeNull();
    await correctLastDraftSelection(owner.id, league.id, draft.id, players[1].id, "Explicit legacy selection correction fixture");
    const replacement = (await draftCorrectionState(db, [pick.id])).get(pick.id)!;
    expect(replacement.action).toBe("RESELECT_DRAFT_PICK");
    expect((replacement.before as { originalSnapshot: unknown }).originalSnapshot).toBeNull();
    const undo = await db.commissionerAuditEvent.findFirstOrThrow({ where: { targetId: pick.id, action: "UNDO_DRAFT_PICK" } });
    expect((undo.before as { playerId: string }).playerId).toBe(players[0].id);
    await setDraftPaused(owner.id, draft.id, false);
    await expect(makePick({ userId: owner.id, draftId: draft.id, playerId: players[1].id, automatic: true })).rejects.toThrow();
    expect(await db.rosterEntry.count({ where: { leagueId: league.id, releasedAt: null } })).toBe(1);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
