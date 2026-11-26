import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague, joinPublicLeague, transitionSportSeason } from "@/server/league";
import { accountForAcquisition, configureFinancePolicy, transferCurrentCap } from "@/server/finance";
import { nominateAuction, placeAuctionBid, processAuctionDraftClocks, settleAuction } from "@/server/auctions";
import { currentCompliance, dropPlayer, setLineupSlot } from "@/server/rosters";
import { recordRookieEligibility } from "@/server/rookies";
import { availableCap } from "@/finance/rules";
import { configureDraftPlan } from "@/server/draft-plans";
import { createDraft, makePick, queuePlayer, setDraftPaused } from "@/server/draft";
import { assignNextSportSeason, importProfessionalSchedules } from "@/server/scheduling";
import { processSeasonLifecycles } from "@/server/lifecycle-processor";

const db = getDatabase();
afterAll(() => db.$disconnect());
let fixtureNumber = 0;
async function fixture(scope: "SPORT" | "UNIVERSAL" = "SPORT", amount = 400, competitionType: "HEAD_TO_HEAD" | "CUMULATIVE" = "HEAD_TO_HEAD") {
  const year = 2030 + 3 * fixtureNumber++;
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const partner = await db.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.test`, name: "Salary fixture partner" } });
  const league = await createLeague(owner.id, { name: `Financial fixture ${randomUUID()}`, sports: ["NFL", "NBA"], historical: true, seasonYear: year, maxTeams: 2, visibility: "PUBLIC", format: "DYNASTY", competitionType });
  await joinPublicLeague(partner.id, league.id);
  await configureFinancePolicy(owner.id, league.id, { salaryMode: true, scope, amount });
  const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id } });
  const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
  const player = await db.player.create({ data: { sport: "NFL", displayName: `Financial fixture ${randomUUID()}`, isSynthetic: true } });
  await recordRookieEligibility({ playerId: player.id, seasonId: sport.seasonId, sport: "NFL", eligible: false, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-financial-fixture", externalId: randomUUID(), sourceRecord: { synthetic: true } });
  return { year, owner, partner, league, teams, sport, player, cleanup: async () => { await db.league.delete({ where: { id: league.id } }); await db.user.delete({ where: { id: partner.id } }); } };
}
it("settles 19 versus 7 at 8, releases reservations, preserves salary history and enforces release floors/cooldown", async () => {
  const f = await fixture();
  try {
    const at = new Date();
    const auction = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id }, at);
    expect(+auction.closesAt - +at).toBe(86400000);
    await placeAuctionBid(f.owner.id, auction.id, 7, at);
    await placeAuctionBid(f.partner.id, auction.id, 19, at);
    await expect(settleAuction(auction.id, new Date(+auction.closesAt - 1))).rejects.toThrow(/not due/);
    const settled = await settleAuction(auction.id, auction.closesAt);
    expect(settled.price).toBe(8);
    expect((await settleAuction(auction.id, auction.closesAt)).id).toBe(settled.id);
    const salary = await db.playerSalary.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId: f.league.id, playerId: f.player.id } } });
    expect(salary.amount).toBe(8);
    expect((await db.financeAccount.findUniqueOrThrow({ where: { id: salary.accountId } })).reserved).toBe(0);
    await dropPlayer(f.partner.id, f.league.id, f.player.id, "NFL", auction.closesAt);
    expect((await db.releasedPlayerFloor.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId: f.league.id, playerId: f.player.id } } })).amount).toBe(4);
    await expect(nominateAuction(f.partner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id }, new Date(+auction.closesAt + 1))).rejects.toThrow(/seven days/);
    const next = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id }, new Date(+auction.closesAt + 1));
    expect((await settleAuction(next.id, next.closesAt)).price).toBe(4);
    expect(await db.deadCapObligation.count({ where: { playerId: f.player.id, clearedAt: null } })).toBe(0);
    await expect(db.releasedPlayerFloor.update({ where: { leagueId_playerId: { leagueId: f.league.id, playerId: f.player.id } }, data: { amount: 5 } })).rejects.toThrow(/only decrease/);
    const ledger = await db.financeLedgerEntry.findFirstOrThrow({ where: { account: { leagueId: f.league.id } } });
    await expect(db.financeLedgerEntry.update({ where: { id: ledger.id }, data: { availableAfter: 999 } })).rejects.toThrow(/append-only/);
  } finally { await f.cleanup(); }
});
it("credits only the reacquiring franchise's own dead cap exactly once after seven days", async () => {
  const f = await fixture();
  try {
    const first = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id });
    await placeAuctionBid(f.owner.id, first.id, 100); await placeAuctionBid(f.partner.id, first.id, 26);
    expect((await settleAuction(first.id, first.closesAt)).price).toBe(27);
    await dropPlayer(f.owner.id, f.league.id, f.player.id, "NFL", first.closesAt);
    const salary = await db.playerSalary.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId: f.league.id, playerId: f.player.id } } });
    const before = await db.financeAccount.findUniqueOrThrow({ where: { id: salary.accountId } });
    expect(before).toMatchObject({ payroll: 0, deadCap: 14 });
    const at = new Date(+first.closesAt + 7 * 86400000);
    const again = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id }, at);
    expect((await db.acquisitionBid.findFirstOrThrow({ where: { auctionId: again.id } })).reservation).toBe(0);
    expect((await settleAuction(again.id, again.closesAt)).price).toBe(14);
    const after = await db.financeAccount.findUniqueOrThrow({ where: { id: salary.accountId } });
    expect(after).toMatchObject({ payroll: 14, deadCap: 0, reserved: 0 });
    expect(availableCap(after)).toBe(availableCap(before));
    await settleAuction(again.id, again.closesAt);
    expect((await db.financeAccount.findUniqueOrThrow({ where: { id: salary.accountId } })).payroll).toBe(14);
  } finally { await f.cleanup(); }
});
it("conserves current-cycle universal cap and rejects idempotency-key reuse with different payloads", async () => {
  const f = await fixture("UNIVERSAL", 500);
  try {
    const accounts = await db.$transaction(async (tx) => Promise.all(f.teams.map((team) => accountForAcquisition(tx, f.sport.id, team.id))));
    const key = randomUUID();
    await db.$transaction((tx) => transferCurrentCap(tx, accounts[0].id, accounts[1].id, 100, key), { isolationLevel: "Serializable" });
    await db.$transaction((tx) => transferCurrentCap(tx, accounts[0].id, accounts[1].id, 100, key), { isolationLevel: "Serializable" });
    const values = await db.financeAccount.findMany({ where: { leagueId: f.league.id } });
    expect(values.reduce((sum, account) => sum + account.baseCap + account.capAdjustment, 0)).toBe(1000);
    expect(values.map(availableCap).sort((a, b) => a - b)).toEqual([400, 600]);
    await expect(db.$transaction((tx) => transferCurrentCap(tx, accounts[0].id, accounts[1].id, 101, key), { isolationLevel: "Serializable" })).rejects.toThrow(/idempotency/);
    await expect(db.$transaction((tx) => transferCurrentCap(tx, accounts[0].id, accounts[1].id, 401), { isolationLevel: "Serializable" })).rejects.toThrow(/Insufficient/);
    await db.championshipCycle.update({ where: { id: accounts[0].cycleId! }, data: { status: "COMPLETE" } });
    await processSeasonLifecycles(); await processSeasonLifecycles();
    const expired = await db.financeAccount.findMany({ where: { leagueId: f.league.id } });
    expect(expired.every(({ capAdjustment, status }) => capAdjustment === 0 && status === "EXPIRED")).toBe(true);
    expect(await db.financeLedgerEntry.count({ where: { account: { leagueId: f.league.id }, type: "CAP_TRANSFER_EXPIRY" } })).toBe(2);
  } finally { await f.cleanup(); }
});

it("executes a traditional cumulative auction with nomination ordering, public bids and pause-safe settlement clocks", async () => {
  const f = await fixture("SPORT", 400, "CUMULATIVE");
  try {
    await configureFinancePolicy(f.owner.id, f.league.id, { salaryMode: false, scope: "SPORT", amount: 100 });
    const owner = f.teams.find(({ managerId }) => managerId === f.owner.id)!;
    const partner = f.teams.find(({ managerId }) => managerId === f.partner.id)!;
    await configureDraftPlan(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, method: "AUCTION", orderMethod: "CUSTOM", order: [owner.id, partner.id], rounds: 1, secondsPerPick: 30, scheduledAt: null, timezone: "UTC" });
    const now = new Date(); const draft = await createDraft(f.owner.id, f.league.id, "NFL", { now });
    await expect(makePick({ userId: f.owner.id, draftId: draft.id, playerId: f.player.id })).rejects.toThrow(/auction settlement/i);
    const auction = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, draftId: draft.id, playerId: f.player.id }, now);
    await placeAuctionBid(f.partner.id, auction.id, 7, new Date(+now + 10000));
    await expect(settleAuction(auction.id, new Date(+now + 30000))).rejects.toThrow(/not due/i);
    await setDraftPaused(f.owner.id, draft.id, true, new Date(+now + 20000));
    await expect(placeAuctionBid(f.owner.id, auction.id, 8, new Date(+now + 21000))).rejects.toThrow(/not accepting/);
    await setDraftPaused(f.owner.id, draft.id, false, new Date(+now + 100000));
    expect((await db.acquisitionAuction.findUniqueOrThrow({ where: { id: auction.id } })).closesAt).toEqual(new Date(+now + 120000));
    expect((await settleAuction(auction.id, new Date(+now + 120000))).price).toBe(7);
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).pickOrder[1]).toBe(owner.id);
    const second = await db.player.create({ data: { sport: "NFL", displayName: `Second auction fixture ${randomUUID()}`, isSynthetic: true } });
    const next = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, draftId: draft.id, playerId: second.id }, new Date(+now + 120001));
    await expect(placeAuctionBid(f.partner.id, next.id, 2, new Date(+now + 120002))).rejects.toThrow(/filled/);
    await settleAuction(next.id, next.closesAt);
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("COMPLETE");
    expect(await db.draftPick.count({ where: { draftId: draft.id } })).toBe(2);
    expect(await db.playerSalary.count({ where: { leagueId: f.league.id } })).toBe(0);
    expect(await db.relativeMatchupPeriod.count({ where: { leagueId: f.league.id } })).toBe(0);
    expect(await db.competitiveTiebreakerEvent.count({ where: { scopeId: draft.id, scopeType: "AUCTION_WAIVER_PRIORITY" } })).toBe(2);
  } finally { await f.cleanup(); }
});

it("rolls one salary sport independently, adds two once, expires its dead cap/floors/transfers and preserves overlapping accounts", async () => {
  const f = await fixture();
  try {
    const auction = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id });
    await settleAuction(auction.id, auction.closesAt);
    const owner = f.teams.find(({ managerId }) => managerId === f.owner.id)!;
    const nba = await db.leagueSport.findFirstOrThrow({ where: { leagueId: f.league.id, sport: "NBA" } });
    const nbaAccount = await db.$transaction((tx) => accountForAcquisition(tx, nba.id, owner.id));
    const original = await db.playerSalary.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId: f.league.id, playerId: f.player.id } } });
    const released = await db.player.create({ data: { sport: "NFL", displayName: `Rollover released fixture ${randomUUID()}`, isSynthetic: true } });
    await db.releasedPlayerFloor.create({ data: { leagueId: f.league.id, playerId: released.id, amount: 4 } });
    await importProfessionalSchedules({ provider: `rollover-fixture-${randomUUID()}`, sourceName: "Isolated synthetic calendar", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NFL", startYear: f.year + 1, label: String(f.year + 1), status: "AVAILABLE", regularSeasonStartsAt: `${f.year + 1}-09-01`, regularSeasonEndsAt: `${f.year + 2}-01-10`, postseasonEndsAt: `${f.year + 2}-02-10` }] });
    const next = await assignNextSportSeason(f.owner.id, f.league.id, "NFL");
    await transitionSportSeason(f.owner.id, f.league.id, "NFL", f.year + 1, auction.closesAt);
    await transitionSportSeason(f.owner.id, f.league.id, "NFL", f.year + 1, auction.closesAt);
    const current = await db.playerSalary.findUniqueOrThrow({ where: { id: original.id } });
    expect(current.amount).toBe(3);
    expect(current.accountId).not.toBe(original.accountId);
    expect((await db.financeAccount.findUniqueOrThrow({ where: { id: original.accountId } })).status).toBe("EXPIRED");
    expect(await db.financeAccount.findUniqueOrThrow({ where: { id: nbaAccount.id } })).toEqual(nbaAccount);
    expect(await db.releasedPlayerFloor.count({ where: { leagueId: f.league.id, playerId: released.id } })).toBe(0);
    expect(await db.financeLedgerEntry.count({ where: { idempotencyKey: `annual-salary:${next.seasonId}:${original.id}` } })).toBe(1);
    expect(await db.futureDraftPick.count({ where: { leagueSport: { leagueId: f.league.id } } })).toBe(0);
  } finally { await f.cleanup(); }
});

it("requires incremental cuts after annual increases put a franchise over cap", async () => {
  const f = await fixture("SPORT", 5);
  try {
    const second = await db.player.create({ data: { sport: "NFL", displayName: `Over-cap fixture ${randomUUID()}`, isSynthetic: true } });
    await recordRookieEligibility({ playerId: second.id, seasonId: f.sport.seasonId, sport: "NFL", eligible: false, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-cap-compliance", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    let at = new Date();
    for (const [playerId, maximum] of [[f.player.id, 2], [second.id, 3]] as const) {
      const auction = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId }, at);
      await placeAuctionBid(f.owner.id, auction.id, maximum, at);
      await placeAuctionBid(f.partner.id, auction.id, maximum - 1, at);
      expect((await settleAuction(auction.id, auction.closesAt)).price).toBe(maximum);
      at = new Date(+auction.closesAt + 1);
    }
    await importProfessionalSchedules({ provider: `over-cap-rollover-${randomUUID()}`, sourceName: "Isolated cap compliance fixture", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NFL", startYear: f.year + 1, label: String(f.year + 1), status: "AVAILABLE", regularSeasonStartsAt: `${f.year + 1}-09-01`, regularSeasonEndsAt: `${f.year + 2}-01-10` }] });
    await assignNextSportSeason(f.owner.id, f.league.id, "NFL");
    await transitionSportSeason(f.owner.id, f.league.id, "NFL", f.year + 1, at);
    const team = f.teams.find(({ managerId }) => managerId === f.owner.id)!;
    expect((await currentCompliance(db, team.id, at)).state).toBe("OVER_CAPACITY");
    const entry = await db.rosterEntry.findFirstOrThrow({ where: { leagueId: f.league.id, playerId: f.player.id, releasedAt: null } });
    await expect(setLineupSlot(f.owner.id, f.league.id, entry.id, "BENCH", "NFL")).rejects.toThrow(/Cut players|salary/i);
    await dropPlayer(f.owner.id, f.league.id, f.player.id, "NFL", at);
    expect((await currentCompliance(db, team.id, at)).state).toBe("OVER_CAPACITY");
    await dropPlayer(f.owner.id, f.league.id, second.id, "NFL", at);
    expect((await currentCompliance(db, team.id, at)).state).toBe("COMPLIANT");
    const account = await db.financeAccount.findFirstOrThrow({ where: { teamId: team.id, kind: "SALARY", status: "ACTIVE" } });
    expect(account).toMatchObject({ baseCap: 5, payroll: 0, deadCap: 5, reserved: 0 });
  } finally { await f.cleanup(); }
});

it.each([{ salary: true, scope: "SPORT" as const }, { salary: true, scope: "UNIVERSAL" as const }, { salary: false, scope: "UNIVERSAL" as const }])("executes universal auction nominations across sports and scopes (salary=$salary scope=$scope)", async ({ salary, scope }) => {
  const f = await fixture(scope, scope === "SPORT" ? 400 : 500);
  try {
    if (!salary) await configureFinancePolicy(f.owner.id, f.league.id, { salaryMode: false, scope: "UNIVERSAL", amount: 100 });
    const owner = f.teams.find(({ managerId }) => managerId === f.owner.id)!;
    const partner = f.teams.find(({ managerId }) => managerId === f.partner.id)!;
    const nba = await db.leagueSport.findFirstOrThrow({ where: { leagueId: f.league.id, sport: "NBA" } });
    const player = await db.player.create({ data: { sport: "NBA", displayName: `Universal NBA nomination ${randomUUID()}`, isSynthetic: true } });
    const plan = await configureDraftPlan(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, scope: "UNIVERSAL", method: "AUCTION", orderMethod: "CUSTOM", order: [owner.id, partner.id], rounds: 1, secondsPerPick: 30, scheduledAt: null, timezone: "UTC" });
    const draft = await createDraft(f.owner.id, f.league.id, "NBA");
    expect(draft.id).toBe(plan.draftId);
    const first = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, draftId: draft.id, playerId: f.player.id });
    await settleAuction(first.id, first.closesAt);
    await queuePlayer(f.partner.id, draft.id, player.id);
    await processAuctionDraftClocks(new Date(+first.closesAt + 30000));
    const nomination = await db.acquisitionAuction.findFirstOrThrow({ where: { draftId: draft.id, status: "OPEN" } });
    expect(nomination).toMatchObject({ playerId: player.id, leagueSportId: nba.id, nominatorTeamId: partner.id });
    await settleAuction(nomination.id, nomination.closesAt);
    expect((await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("COMPLETE");
    expect((await db.rosterEntry.findFirstOrThrow({ where: { leagueId: f.league.id, playerId: player.id, releasedAt: null } })).seasonId).toBe(nba.seasonId);
    expect(await db.relativeMatchupPeriod.count({ where: { leagueId: f.league.id } })).toBe(28);
    const accounts = await db.financeAccount.findMany({ where: { leagueId: f.league.id } });
    expect(accounts.reduce((sum, account) => sum + account.payroll, 0)).toBe(2);
    expect(accounts).toHaveLength(salary && scope === "SPORT" ? 4 : 2);
    expect(await db.playerSalary.count({ where: { leagueId: f.league.id, active: true } })).toBe(salary ? 2 : 0);
    expect((await db.draftSelectionSnapshot.findMany({ where: { pick: { draftId: draft.id } } })).map(({ price }) => price)).toEqual([1, 1]);
    if (salary) {
      const { provisionFutureDraftPicks } = await import("@/server/dynasty-picks");
      await expect(provisionFutureDraftPicks(f.owner.id, f.league.id, f.sport.id)).rejects.toThrow(/no future rookie picks/);
      await expect(db.futureDraftPick.create({ data: { leagueSportId: f.sport.id, seasonStartYear: f.year + 1, round: 1, originalTeamId: owner.id, ownerTeamId: owner.id } })).rejects.toThrow(/traditional/);
    }
  } finally { await f.cleanup(); }
});

it("removes free-agent floors in a verified offseason while preserving independent franchise dead cap", async () => {
  const f = await fixture();
  try {
    const auction = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id });
    await placeAuctionBid(f.owner.id, auction.id, 100); await placeAuctionBid(f.partner.id, auction.id, 7);
    await settleAuction(auction.id, auction.closesAt);
    await dropPlayer(f.owner.id, f.league.id, f.player.id, "NFL", auction.closesAt);
    expect((await db.releasedPlayerFloor.findFirstOrThrow({ where: { leagueId: f.league.id, playerId: f.player.id } })).amount).toBe(4);
    await importProfessionalSchedules({ provider: `offseason-floor-${randomUUID()}`, sourceName: "Isolated verified offseason fixture", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NFL", startYear: f.year, label: String(f.year), status: "AVAILABLE", regularSeasonStartsAt: `${f.year}-09-01`, regularSeasonEndsAt: `${f.year + 1}-01-10`, postseasonEndsAt: `${f.year + 1}-02-01` }] });
    await processSeasonLifecycles(auction.closesAt); await processSeasonLifecycles(auction.closesAt);
    expect(await db.releasedPlayerFloor.count({ where: { leagueId: f.league.id, playerId: f.player.id } })).toBe(0);
    expect((await db.deadCapObligation.findFirstOrThrow({ where: { playerId: f.player.id, clearedAt: null } })).amount).toBe(4);
    const next = await nominateAuction(f.partner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id }, auction.closesAt);
    expect(next.minimum).toBe(1);
  } finally { await f.cleanup(); }
});
it("prevents two concurrent sealed maximum bids from spending the same unreserved cap", async () => {
  const f = await fixture();
  try {
    const at = new Date();
    const secondPlayer = await db.player.create({ data: { sport: "NFL", displayName: `Concurrent auction fixture ${randomUUID()}`, isSynthetic: true } });
    await recordRookieEligibility({ playerId: secondPlayer.id, seasonId: f.sport.seasonId, sport: "NFL", eligible: false, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-concurrent-finance", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    const a = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id }, at);
    const b = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: secondPlayer.id }, at);
    const results = await Promise.allSettled([placeAuctionBid(f.owner.id, a.id, 300, at), placeAuctionBid(f.owner.id, b.id, 300, at)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const ownerTeam = f.teams.find(({ managerId }) => managerId === f.owner.id)!;
    const account = await db.financeAccount.findFirstOrThrow({ where: { leagueId: f.league.id, teamId: ownerTeam.id } });
    expect(account.reserved).toBe(301); expect(availableCap(account)).toBe(99);
    const failedId = results[0].status === "rejected" ? a.id : b.id;
    await expect(placeAuctionBid(f.owner.id, failedId, 300, at)).rejects.toThrow(/Insufficient|remaining/);
    await settleAuction(a.id, a.closesAt); await settleAuction(b.id, b.closesAt);
    const after = await db.financeAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after).toMatchObject({ payroll: 2, reserved: 0, deadCap: 0 });
    expect(await db.playerSalary.count({ where: { leagueId: f.league.id, active: true } })).toBe(2);
  } finally { await f.cleanup(); }
});
it("permits a standalone universal current-cycle cap trade after sport deadlines while rejecting mixed player assets", async () => {
  const f = await fixture("UNIVERSAL", 500);
  try {
    const { proposeAdvancedTrade, acceptAdvancedTrade, executeAdvancedTrade } = await import("@/server/advanced-trades");
    const auction = await nominateAuction(f.owner.id, { leagueId: f.league.id, leagueSportId: f.sport.id, playerId: f.player.id });
    await settleAuction(auction.id, auction.closesAt);
    const at = new Date(+auction.closesAt + 1000);
    await db.leagueSportSeason.updateMany({ where: { leagueSport: { leagueId: f.league.id } }, data: { tradeDeadlineAt: new Date(+at - 1000), rolloverEligibleAt: new Date(+at + 90 * 86400000) } });
    const from = f.teams.find(({ managerId }) => managerId === f.owner.id)!;
    const to = f.teams.find(({ managerId }) => managerId === f.partner.id)!;
    const asset = { type: "CAP" as const, from: from.id, to: to.id, leagueSportId: f.sport.id, amount: 25 };
    const input = { leagueId: f.league.id, participants: [from.id, to.id], expiresAt: new Date(+at + 3 * 86400000), assets: [asset] };
    await expect(proposeAdvancedTrade(f.owner.id, { ...input, assets: [asset, { type: "PLAYER", from: from.id, to: to.id, playerId: f.player.id }] }, at)).rejects.toThrow(/deadline has passed/);
    const proposal = await proposeAdvancedTrade(f.owner.id, input, at);
    await acceptAdvancedTrade(f.owner.id, proposal.id, 1, at);
    const review = await acceptAdvancedTrade(f.partner.id, proposal.id, 1, at);
    await executeAdvancedTrade(proposal.id, review.executeAt!);
    const accounts = await db.financeAccount.findMany({ where: { leagueId: f.league.id, kind: "SALARY" } });
    expect(accounts.reduce((sum, { capAdjustment }) => sum + capAdjustment, 0)).toBe(0);
    expect(accounts.map(({ capAdjustment }) => capAdjustment).sort((a, b) => a - b)).toEqual([-25, 25]);
  } finally { await f.cleanup(); }
});
