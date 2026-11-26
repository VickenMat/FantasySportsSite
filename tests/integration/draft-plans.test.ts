import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { autoPickExpiredDraft, makePick, queuePlayer } from "@/server/draft";
import { configureDraftPlan, draftRoomState, processScheduledDrafts } from "@/server/draft-plans";

const db = getDatabase();
afterAll(() => db.$disconnect());
it("opens preparation exactly one hour before a persisted UTC start and atomically starts once with queue-first selection", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Scheduled fixture ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2071 });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const start = new Date("2071-01-02T15:00:00Z"); const before = new Date(+start - 7200000); const opens = new Date(+start - 3600000);
    const input = { leagueId: league.id, leagueSportId: sport.id, method: "SNAKE" as const, orderMethod: "CUSTOM" as const, order: teams.map(({ id }) => id), rounds: 1, secondsPerPick: 30, scheduledAt: start, timezone: "America/Los_Angeles" };
    await expect(configureDraftPlan(randomUUID(), input, before)).rejects.toThrow(/commissioner/i);
    const plan = await configureDraftPlan(user.id, input, before);
    expect(draftRoomState(plan, new Date(+opens - 1))).toBe("SCHEDULED");
    expect(draftRoomState(plan, opens)).toBe("ROOM_OPEN");
    const player = await db.player.findFirstOrThrow({ where: { sport: "NFL", isDemo: true } });
    await expect(queuePlayer(user.id, plan.draftId!, player.id, new Date(+opens - 1))).rejects.toThrow(/one hour/i);
    await queuePlayer(user.id, plan.draftId!, player.id, opens);
    await expect(makePick({ userId: user.id, draftId: plan.draftId!, playerId: player.id, now: opens })).rejects.toThrow(/not active/i);
    await processScheduledDrafts(new Date(+start - 1));
    expect((await db.draft.findUniqueOrThrow({ where: { id: plan.draftId! } })).status).toBe("SCHEDULED");
    await Promise.all([processScheduledDrafts(start), processScheduledDrafts(start)]);
    let draft = await db.draft.findUniqueOrThrow({ where: { id: plan.draftId! } });
    expect(draft).toMatchObject({ status: "ACTIVE", startedAt: start });
    expect(await db.draft.count({ where: { leagueId: league.id } })).toBe(1);
    await expect(configureDraftPlan(user.id, { ...input, expectedVersion: plan.version }, before)).rejects.toThrow(/locked/i);
    const pick = await autoPickExpiredDraft(draft.id, draft.pickDeadlineAt!);
    expect(pick?.playerId).toBe(player.id);
    draft = await db.draft.findUniqueOrThrow({ where: { id: draft.id } });
    await autoPickExpiredDraft(draft.id, draft.pickDeadlineAt!);
    expect((await db.draftPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("COMPLETED");
  } finally { await db.league.delete({ where: { id: league.id } }); }
});

it("persists random initial order and rejects duplicate, stale and unauthorized custom edits", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Order fixture ${randomUUID()}`, sports: ["NBA"], maxTeams: 3, fillWithComputers: true, historical: true, seasonYear: 2072 });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id } });
    const input = { leagueId: league.id, leagueSportId: sport.id, method: "SNAKE" as const, orderMethod: "RANDOM" as const, order: teams.map(({ id }) => id), rounds: 2, secondsPerPick: 90, scheduledAt: null, timezone: "UTC" };
    const first = await configureDraftPlan(user.id, input);
    const second = await configureDraftPlan(user.id, { ...input, expectedVersion: first.version });
    expect(second.order).toEqual(first.order);
    await expect(configureDraftPlan(user.id, { ...input, expectedVersion: first.version })).rejects.toThrow(/changed/i);
    await expect(configureDraftPlan(user.id, { ...input, orderMethod: "CUSTOM", order: [teams[0].id, teams[0].id, teams[1].id], expectedVersion: second.version })).rejects.toThrow(/exactly once/i);
    expect(await db.commissionerAuditEvent.count({ where: { targetId: first.id, targetType: "DraftPlan" } })).toBe(2);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});

it("rejects auction keepers and retains immutable names after a completed snake selection", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Keeper auction gate ${randomUUID()}`, sports: ["NFL"], format: "REDRAFT", keeperLimits: { NFL: 1 }, maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2073 });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const { configureFinancePolicy } = await import("@/server/finance");
    await configureFinancePolicy(user.id, league.id, { salaryMode: false, scope: "SPORT", amount: 100 });
    const input = { leagueId: league.id, leagueSportId: sport.id, method: "AUCTION" as const, orderMethod: "CUSTOM" as const, order: teams.map(({ id }) => id), rounds: 1, secondsPerPick: 30, scheduledAt: null, timezone: "UTC" };
    await expect(configureDraftPlan(user.id, input)).rejects.toThrow(/cannot use redraft keepers/);
    const plan = await configureDraftPlan(user.id, { ...input, method: "SNAKE" });
    const { createDraft } = await import("@/server/draft");
    const draft = await createDraft(user.id, league.id, "NFL");
    const player = await db.player.findFirstOrThrow({ where: { sport: "NFL", isDemo: true } });
    const pick = await makePick({ userId: user.id, draftId: draft.id, playerId: player.id });
    const recap = await db.draftSelectionSnapshot.findUniqueOrThrow({ where: { pickId: pick.id } });
    await db.fantasyTeam.update({ where: { id: teams[0].id }, data: { name: "Renamed after selection" } });
    expect((await db.draftSelectionSnapshot.findUniqueOrThrow({ where: { pickId: pick.id } })).franchiseName).toBe(recap.franchiseName);
    await expect(db.draftSelectionSnapshot.update({ where: { pickId: pick.id }, data: { franchiseName: "Rewrite" } })).rejects.toThrow(/append-only/);
    expect(plan.method).toBe("SNAKE");
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
it("executes a queue-first universal snake across independent sport rosters without changing season selections", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Universal snake fixture ${randomUUID()}`, sports: ["NFL", "NBA"], historical: true, seasonYear: 2083, maxTeams: 2, fillWithComputers: true });
  try {
    const sports = await db.leagueSport.findMany({ where: { leagueId: league.id } });
    const nfl = sports.find(({ sport }) => sport === "NFL")!;
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const plan = await configureDraftPlan(user.id, { leagueId: league.id, leagueSportId: nfl.id, scope: "UNIVERSAL", method: "SNAKE", orderMethod: "CUSTOM", order: teams.map(({ id }) => id), rounds: 1, secondsPerPick: 30, scheduledAt: null, timezone: "UTC" });
    const { createDraft } = await import("@/server/draft");
    const draft = await createDraft(user.id, league.id, "NBA");
    expect(draft.id).toBe(plan.draftId);
    const nba = await db.player.findFirstOrThrow({ where: { sport: "NBA", isDemo: true } });
    await queuePlayer(user.id, draft.id, nba.id);
    const first = await autoPickExpiredDraft(draft.id, draft.pickDeadlineAt!);
    expect(first?.playerId).toBe(nba.id);
    const state = await db.draft.findUniqueOrThrow({ where: { id: draft.id } });
    await autoPickExpiredDraft(draft.id, state.pickDeadlineAt!);
    const entries = await db.rosterEntry.findMany({ where: { leagueId: league.id, releasedAt: null }, include: { fantasyRoster: true } });
    expect(entries).toHaveLength(2);
    expect(entries.find(({ teamId }) => teamId === teams[0].id)?.sport).toBe("NBA");
    expect(entries.every((entry) => entry.sport === entry.fantasyRoster.sport)).toBe(true);
    expect((await db.leagueSport.findMany({ where: { leagueId: league.id } })).map(({ seasonId }) => seasonId).sort()).toEqual(sports.map(({ seasonId }) => seasonId).sort());
    expect(await db.relativeMatchupPeriod.count({ where: { leagueId: league.id } })).toBe(28);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
