import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { consumptionKey, createRookieDraft, listFutureDraftPicks, provisionFutureDraftPicks, transferFuturePick } from "@/server/dynasty-picks";
import { makePick, queuePlayer } from "@/server/draft";
import { recordRookieEligibility } from "@/server/rookies";
import { addFreeAgent, currentCompliance, dropPlayer } from "@/server/rosters";
import { finalizeRookiePlacements } from "../helpers/rookie-placements";
import { configureRookieDraftPlan } from "@/server/rookie-draft-plans";
import { processScheduledDrafts } from "@/server/draft-plans";

const db = getDatabase();
afterAll(() => db.$disconnect());

it("prepares a scheduled linear rookie room and revalidates transferred ownership at atomic worker activation", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Scheduled rookie fixture ${randomUUID()}`, sports: ["NHL"], maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2070 });
  try {
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    await provisionFutureDraftPicks(user.id, league.id, sport.id);
    await finalizeRookiePlacements(sport.id, teams.map(({ id }) => id));
    const { transitionSportSeason } = await import("@/server/league");
    await transitionSportSeason(user.id, league.id, "NHL", 2071);
    const current = await db.leagueSport.findUniqueOrThrow({ where: { id: sport.id } });
    const now = new Date(); const start = new Date(+now + 7200000);
    const input = { leagueId: league.id, leagueSportId: sport.id, rounds: 1, scheduledAt: start, timezone: "UTC", secondsPerPick: 30, reason: "Scheduled reverse-placement rookie fixture" };
    await expect(configureRookieDraftPlan(user.id, { ...input, orderMethod: "RANDOM" } as never, now)).rejects.toThrow(/unrecognized/i);
    const plan = await configureRookieDraftPlan(user.id, input, now);
    const player = await db.player.create({ data: { sport: "NHL", displayName: `Scheduled rookie pool ${randomUUID()}` } });
    await recordRookieEligibility({ playerId: player.id, seasonId: current.seasonId, sport: "NHL", eligible: true, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-rookie-schedule", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    await expect(queuePlayer(user.id, plan.draftId!, player.id, new Date(+start - 3600001))).rejects.toThrow(/one hour/);
    await queuePlayer(user.id, plan.draftId!, player.id, new Date(+start - 3600000));
    await expect(makePick({ userId: user.id, draftId: plan.draftId!, playerId: player.id, now })).rejects.toThrow(/not active/);
    await expect(createRookieDraft(user.id, league.id, sport.id)).rejects.toThrow(/server-controlled start/);
    const entitlement = await db.futureDraftPick.findFirstOrThrow({ where: { leagueSportId: sport.id, seasonStartYear: 2071, round: 1, originalTeamId: teams[0].id } });
    await transferFuturePick(user.id, league.id, entitlement.id, teams[1].id, "Prepared entitlement ownership correction fixture");
    await Promise.all([processScheduledDrafts(start), processScheduledDrafts(start)]);
    const draft = await db.draft.findUniqueOrThrow({ where: { id: plan.draftId! } });
    expect(draft).toMatchObject({ status: "ACTIVE", startedAt: start, order: teams.map(({ id }) => id) });
    expect(draft.pickOrder[0]).toBe(teams[1].id);
    expect(await db.draftQueueEntry.count({ where: { draftId: draft.id } })).toBe(1);
    expect(await db.draft.count({ where: { leagueId: league.id, kind: "ROOKIE" } })).toBe(1);
    await expect(configureRookieDraftPlan(user.id, { ...input, expectedVersion: plan.version }, now)).rejects.toThrow(/locked/);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});

it("extends configured rookie rounds beyond four without resetting transferred original entitlements", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Six-round rookie fixture ${randomUUID()}`, sports: ["NHL"], maxTeams: 2, fillWithComputers: true, format: "DYNASTY", historical: true, seasonYear: 2058 });
  try {
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    await provisionFutureDraftPicks(user.id, league.id, sport.id);
    await finalizeRookiePlacements(sport.id, teams.map(({ id }) => id));
    const future = await db.futureDraftPick.findFirstOrThrow({ where: { leagueSportId: sport.id, seasonStartYear: 2059, originalTeamId: teams[0].id, round: 1 } });
    await transferFuturePick(user.id, league.id, future.id, teams[1].id, "Preserve the negotiated entitlement fixture");
    const { transitionSportSeason } = await import("@/server/league");
    await transitionSportSeason(user.id, league.id, "NHL", 2059);
    const draft = await createRookieDraft(user.id, league.id, sport.id, { rounds: 6, reason: "Six-round configured fixture draft" });
    expect(draft.pickOrder).toHaveLength(12);
    expect(draft.pickOrder[0]).toBe(teams[1].id);
    expect(JSON.parse(draft.orderProvenance!).slots[0].originalTeamId).toBe(teams[0].id);
    expect((await db.futureDraftPick.findUniqueOrThrow({ where: { id: future.id } })).ownerTeamId).toBe(teams[1].id);
    expect((await db.rookieDraftRule.findUniqueOrThrow({ where: { leagueSportId: sport.id } })).rounds).toBe(6);
    expect(await db.futureDraftPick.count({ where: { leagueSportId: sport.id, round: 6 } })).toBe(8);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});

it("executes linear rookie entitlements with traded ownership, immutable consumption and correctable overflow", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Rookie ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 2, fillWithComputers: true, format: "DYNASTY", historical: true, seasonYear: 2060 });
  try {
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const manager = teams.find(({ managerId }) => managerId === user.id)!;
    const other = teams.find(({ id }) => id !== manager.id)!;
    await provisionFutureDraftPicks(user.id, league.id, sport.id);
    const season = await db.season.upsert({ where: { sport_startYear: { sport: "NFL", startYear: 2061 } }, create: { sport: "NFL", startYear: 2061, label: "2061 isolated rookie fixture" }, update: {} });
    await db.leagueSport.update({ where: { id: sport.id }, data: { seasonId: season.id, seasonLabel: season.label, benchSlots: 1 } });
    const picks = await db.futureDraftPick.findMany({ where: { leagueSportId: sport.id, seasonStartYear: 2061 }, orderBy: { round: "asc" } });
    const transferred = picks.find(({ originalTeamId, round }) => originalTeamId === other.id && round === 1)!;
    await expect(transferFuturePick(randomUUID(), league.id, transferred.id, manager.id, "fixture ownership correction")).rejects.toThrow(/commissioner/i);
    await transferFuturePick(user.id, league.id, transferred.id, manager.id, "fixture ownership correction");
    await expect(createRookieDraft(user.id, league.id, sport.id)).rejects.toThrow(/finalized previous.*placements/i);
    await finalizeRookiePlacements(sport.id, [manager.id, other.id]);
    const draft = await createRookieDraft(user.id, league.id, sport.id, { rounds: 2, reason: "Isolated finalized rookie order" });
    expect(draft.pickOrder).toEqual([manager.id, manager.id, manager.id, other.id]);
    expect((await createRookieDraft(user.id, league.id, sport.id)).id).toBe(draft.id);
    const rookies = [];
    for (let index = 0; index < 5; index++) {
      const player = await db.player.create({ data: { sport: "NFL", displayName: `Rookie fixture ${randomUUID()}`, isSynthetic: true } });
      rookies.push(player);
      if (index < 4) await recordRookieEligibility({ playerId: player.id, seasonId: season.id, sport: "NFL", eligible: true, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-rookie-fixture", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    }
    const now = new Date();
    await expect(makePick({ userId: user.id, draftId: draft.id, playerId: rookies[4].id, automatic: true, now })).rejects.toThrow(/verified rookie/i);
    for (let index = 0; index < 4; index++) {
      const pick = await makePick({ userId: user.id, draftId: draft.id, playerId: rookies[index].id, automatic: true, now });
      expect([pick.round, pick.roundPick]).toEqual([Math.floor(index / 2) + 1, index % 2 + 1]);
      if (index === 1) await expect(transferFuturePick(user.id, league.id, transferred.id, other.id, "try to transfer consumed pick")).rejects.toThrow(/consumed/i);
    }
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("COMPLETE");
    const inventory = await listFutureDraftPicks(user.id, league.id, sport.id, true);
    expect(inventory.filter(({ state }) => state === "CONSUMED")).toHaveLength(4);
    expect(inventory.filter(({ state }) => state === "EXPIRED")).toHaveLength(4);
    expect(await db.futureDraftPickOwnership.count({ where: { idempotencyKey: { in: picks.map(({ id }) => consumptionKey(id)) } } })).toBe(4);
    const roster = await db.rosterEntry.findMany({ where: { teamId: manager.id, releasedAt: null } });
    expect(roster.filter(({ slot }) => slot === "ROOKIE_OVERFLOW")).toHaveLength(2);
    expect((await currentCompliance(db, manager.id, now)).state).toBe("OVER_CAPACITY");
    await expect(addFreeAgent(user.id, league.id, rookies[4].id, "NFL")).rejects.toThrow(/noncompliance/i);
    const nba = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NBA" } });
    await provisionFutureDraftPicks(user.id, league.id, nba.id);
    const nbaSeason = await db.season.upsert({ where: { sport_startYear: { sport: "NBA", startYear: 2061 } }, create: { sport: "NBA", startYear: 2061, label: "2061 NBA rookie fixture" }, update: {} });
    await db.leagueSport.update({ where: { id: nba.id }, data: { seasonId: nbaSeason.id, seasonLabel: nbaSeason.label } });
    await finalizeRookiePlacements(nba.id, [manager.id, other.id]);
    const nbaDraft = await createRookieDraft(user.id, league.id, nba.id, { rounds: 1, reason: "Independent NBA finalized rookie fixture order" });
    const nbaRookie = await db.player.create({ data: { sport: "NBA", displayName: `NBA rookie ${randomUUID()}`, isSynthetic: true } });
    await recordRookieEligibility({ playerId: nbaRookie.id, seasonId: nbaSeason.id, sport: "NBA", eligible: true, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-rookie-fixture", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    await expect(makePick({ userId: user.id, draftId: nbaDraft.id, playerId: nbaRookie.id, automatic: true, now })).resolves.toMatchObject({ teamId: manager.id, round: 1 });
    for (const entry of roster.filter(({ slot }) => slot === "ROOKIE_OVERFLOW")) await dropPlayer(user.id, league.id, entry.playerId, "NFL");
    expect((await currentCompliance(db, manager.id, now)).state).toBe("COMPLIANT");
    await expect(makePick({ userId: user.id, draftId: draft.id, playerId: rookies[4].id, automatic: true, now })).rejects.toThrow(/not active/i);
  } finally {
    await db.league.delete({ where: { id: league.id } });
    // Evidence is append-only, so fixture players remain inside this disposable schema.
  }
});

it("uses only reverse finalized placement, rejects revoked ordering paths and supports unconsumed pick transfers", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Rookie lottery ${randomUUID()}`, sports: ["NBA"], maxTeams: 4, fillWithComputers: true, format: "DYNASTY", historical: true, seasonYear: 2069 });
  try {
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const competition = await db.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id } });
    await db.sportCompetition.update({ where: { id: competition.id }, data: { status: "FINALIZED", finalizedAt: new Date() } });
    await db.sportFinalPlacement.createMany({ data: teams.map((team, index) => ({ sportCompetitionId: competition.id, teamId: team.id, placement: 4 - index, qualifiedForPlayoffs: index >= 2, finalizedAt: new Date() })) });
    await provisionFutureDraftPicks(user.id, league.id, sport.id);
    const season = await db.season.upsert({ where: { sport_startYear: { sport: "NBA", startYear: 2070 } }, create: { sport: "NBA", startYear: 2070, label: "2070 lottery fixture" }, update: {} });
    await db.leagueSport.update({ where: { id: sport.id }, data: { seasonId: season.id, seasonLabel: season.label } });
    await expect(createRookieDraft(user.id, league.id, sport.id, { lottery: {} } as never)).rejects.toThrow(/unrecognized/i);
    await expect(createRookieDraft(user.id, league.id, sport.id, { manualOrder: teams.map(({ id }) => id) } as never)).rejects.toThrow(/unrecognized/i);
    const draft = await createRookieDraft(user.id, league.id, sport.id, { rounds: 2, reason: "Reverse finalized placement fixture" });
    const snapshot = JSON.parse(draft.orderProvenance!);
    expect(snapshot.orderSource).toBe("REVERSE_FINAL_PLACEMENT");
    expect(snapshot).not.toHaveProperty("lotteryResult");
    expect(draft.order).toEqual(teams.map(({ id }) => id));
    expect(draft.pickOrder.slice(0, 4)).toEqual(draft.pickOrder.slice(4));
    expect((await createRookieDraft(user.id, league.id, sport.id)).orderProvenance).toBe(draft.orderProvenance);
    const last = snapshot.slots[7];
    await transferFuturePick(user.id, league.id, last.futurePickId, teams[0].id, "Explicit active-draft ownership correction");
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).pickOrder[7]).toBe(teams[0].id);
    expect(await db.commissionerAuditEvent.count({ where: { targetId: draft.id, action: "START_ROOKIE_DRAFT" } })).toBe(1);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
