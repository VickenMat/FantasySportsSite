import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague, joinPublicLeague } from "@/server/league";
import { acceptAdvancedTrade, closeAdvancedTrade, configureTradeReview, executeAdvancedTrade, processAdvancedTrades, proposeAdvancedTrade, type TradeAssets } from "@/server/advanced-trades";
import { accountForWaiver } from "@/server/faab";
import { extendFutureDraftPicks } from "@/server/dynasty-picks";

const db = getDatabase();
afterAll(() => db.$disconnect());
async function fixture() {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const others = await Promise.all([1, 2].map(() => db.user.create({ data: { id: randomUUID(), name: "Isolated trading fixture", email: `${randomUUID()}@example.test` } })));
  const league = await createLeague(owner.id, { name: `Trade fixture ${randomUUID()}`, historical: true, seasonYear: 2051, sports: ["NFL", "NBA"], format: "DYNASTY", maxTeams: 3, visibility: "PUBLIC", waiverMethod: "FAAB" });
  for (const user of others) await joinPublicLeague(user.id, league.id);
  const users = [owner, ...others];
  const teams = await Promise.all(users.map((user) => db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: user.id } })));
  const sports = await db.leagueSport.findMany({ where: { leagueId: league.id } });
  const at = new Date();
  await db.leagueSportSeason.updateMany({ where: { leagueSportId: { in: sports.map(({ id }) => id) } }, data: { tradeDeadlineAt: new Date(+at + 30 * 86400000), rolloverEligibleAt: new Date(+at + 60 * 86400000) } });
  const players = await Promise.all(teams.map(async (team, i) => {
    const sport = sports.find((row) => row.sport === (i === 1 ? "NBA" : "NFL"))!;
    const player = await db.player.create({ data: { sport: sport.sport, displayName: `Trade fixture ${randomUUID()}`, isSynthetic: true } });
    const roster = await db.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: team.id, leagueSportId: sport.id } } });
    await db.rosterEntry.create({ data: { leagueId: league.id, teamId: team.id, rosterId: roster.id, playerId: player.id, sport: sport.sport, seasonId: sport.seasonId, slot: "BENCH", slotIndex: 1 } });
    return player;
  }));
  const assets: TradeAssets = players.map((player, i) => ({ type: "PLAYER", from: teams[i].id, to: teams[(i + 1) % 3].id, playerId: player.id }));
  const input = { leagueId: league.id, participants: teams.map(({ id }) => id), assets, expiresAt: new Date(+at + 7 * 86400000) };
  return { owner, users, teams, players, sports, league, at, assets, input, cleanup: async () => { await db.league.delete({ where: { id: league.id } }); for (const user of others) await db.user.delete({ where: { id: user.id } }); } };
}
it("settles a three-team cross-sport revision exactly once after every manager accepts and the full review elapses", async () => {
  const f = await fixture();
  try {
    const proposal = await proposeAdvancedTrade(f.owner.id, f.input, f.at);
    for (const user of f.users.slice(0, 2)) await acceptAdvancedTrade(user.id, proposal.id, 1, f.at);
    expect((await db.tradeProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("PENDING");
    const review = await acceptAdvancedTrade(f.users[2].id, proposal.id, 1, f.at);
    expect(+review.executeAt! - +f.at).toBe(86400000);
    await expect(executeAdvancedTrade(proposal.id, new Date(+review.executeAt! - 1))).rejects.toThrow(/not due/);
    await executeAdvancedTrade(proposal.id, review.executeAt!);
    await executeAdvancedTrade(proposal.id, review.executeAt!);
    for (let i = 0; i < 3; i++) expect((await db.rosterEntry.findFirstOrThrow({ where: { leagueId: f.league.id, playerId: f.players[i].id, releasedAt: null } })).teamId).toBe(f.teams[(i + 1) % 3].id);
    expect(await db.fantasyTransaction.count({ where: { leagueId: f.league.id, type: "TRADE" } })).toBe(3);
    const revision = await db.tradeProposalRevision.findFirstOrThrow({ where: { proposalId: proposal.id } });
    await expect(db.tradeProposalRevision.update({ where: { id: revision.id }, data: { assets: [] } })).rejects.toThrow(/append-only/);
  } finally { await f.cleanup(); }
});
it("invalidates old acceptances on revision and reserves/release FAAB only for the accepted identical revision", async () => {
  const f = await fixture();
  try {
    const nfl = f.sports.find(({ sport }) => sport === "NFL")!;
    const accounts = await db.$transaction((tx) => Promise.all(f.teams.map((team) => accountForWaiver(tx, f.league.id, nfl.id, team.id))));
    const money: TradeAssets = [{ type: "FAAB", from: f.teams[0].id, to: f.teams[1].id, leagueSportId: nfl.id, amount: 20 }];
    const input = { ...f.input, participants: f.teams.slice(0, 2).map(({ id }) => id), assets: money };
    const first = await proposeAdvancedTrade(f.owner.id, input, f.at);
    await acceptAdvancedTrade(f.owner.id, first.id, 1, f.at);
    await proposeAdvancedTrade(f.owner.id, { ...input, proposalId: first.id, expectedRevision: 1, assets: [{ ...money[0], amount: 30 } as TradeAssets[number]] }, f.at);
    await expect(acceptAdvancedTrade(f.users[1].id, first.id, 1, f.at)).rejects.toThrow(/revision/);
    await acceptAdvancedTrade(f.users[1].id, first.id, 2, f.at);
    expect((await db.faabAccount.findUniqueOrThrow({ where: { id: accounts[0].id } })).reserved).toBe(0);
    await acceptAdvancedTrade(f.owner.id, first.id, 2, f.at);
    expect((await db.faabAccount.findUniqueOrThrow({ where: { id: accounts[0].id } })).reserved).toBe(30);
    await expect(closeAdvancedTrade(f.owner.id, first.id, "CANCEL", "No longer desired", f.at)).rejects.toThrow(/before final acceptance/);
    await closeAdvancedTrade(f.owner.id, first.id, "VETO", "Verified commissioner veto", f.at);
    expect((await db.faabAccount.findUniqueOrThrow({ where: { id: accounts[0].id } })).reserved).toBe(0);
    expect(await db.tradeProposalAcceptance.count({ where: { revision: { proposalId: first.id } } })).toBe(3);
  } finally { await f.cleanup(); }
});
it("transfers negotiated future picks with conserved FAAB and invalidates conflicting offers", async () => {
  const f = await fixture();
  try {
    await configureTradeReview(f.owner.id, f.league.id, 0);
    const sport = f.sports[0];
    await db.$transaction((tx) => extendFutureDraftPicks(tx, sport.id, 2051, f.teams.map(({ id }) => id)));
    const pick = await db.futureDraftPick.findFirstOrThrow({ where: { leagueSportId: sport.id, ownerTeamId: f.teams[0].id } });
    const assets: TradeAssets = [{ type: "PICK", from: f.teams[0].id, to: f.teams[1].id, pickId: pick.id }, { type: "FAAB", from: f.teams[1].id, to: f.teams[0].id, leagueSportId: sport.id, amount: 25 }];
    const input = { ...f.input, participants: f.teams.slice(0, 2).map(({ id }) => id), assets };
    const a = await proposeAdvancedTrade(f.owner.id, input, f.at);
    const b = await proposeAdvancedTrade(f.owner.id, input, f.at);
    await acceptAdvancedTrade(f.owner.id, a.id, 1, f.at); await acceptAdvancedTrade(f.users[1].id, a.id, 1, f.at);
    await processAdvancedTrades(f.at);
    expect((await db.futureDraftPick.findUniqueOrThrow({ where: { id: pick.id } })).ownerTeamId).toBe(f.teams[1].id);
    expect((await db.tradeProposal.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("INVALIDATED");
    const funds = await db.faabAccount.findMany({ where: { leagueId: f.league.id, leagueSportId: sport.id } });
    expect(funds.reduce((sum, account) => sum + account.balance, 0)).toBe(300);
    expect(funds.map(({ balance }) => balance).sort((a, b) => a - b)).toEqual([75, 100, 125]);
  } finally { await f.cleanup(); }
});
it("rolls every transfer back when one asset's ownership changes and releases review reservations on invalidation", async () => {
  const f = await fixture();
  try {
    await configureTradeReview(f.owner.id, f.league.id, 0);
    const proposal = await proposeAdvancedTrade(f.owner.id, f.input, f.at);
    for (const user of f.users) await acceptAdvancedTrade(user.id, proposal.id, 1, f.at);
    await db.rosterEntry.updateMany({ where: { leagueId: f.league.id, playerId: f.players[2].id, releasedAt: null }, data: { releasedAt: f.at } });
    await expect(executeAdvancedTrade(proposal.id, f.at)).rejects.toThrow(/ownership changed/);
    expect((await db.rosterEntry.findFirstOrThrow({ where: { leagueId: f.league.id, playerId: f.players[0].id, releasedAt: null } })).teamId).toBe(f.teams[0].id);
    expect(await db.fantasyTransaction.count({ where: { leagueId: f.league.id, type: "TRADE" } })).toBe(0);
    await processAdvancedTrades(f.at);
    expect((await db.tradeProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("INVALIDATED");
  } finally { await f.cleanup(); }
});
it("rejects an offer whose review would cross any player deadline and forbids unauthorized revision/veto", async () => {
  const f = await fixture();
  try {
    await db.leagueSportSeason.updateMany({ where: { leagueSportId: { in: f.sports.map(({ id }) => id) } }, data: { tradeDeadlineAt: new Date(+f.at + 3600000) } });
    await expect(proposeAdvancedTrade(f.owner.id, f.input, f.at)).rejects.toThrow(/review window/);
    await configureTradeReview(f.owner.id, f.league.id, 0);
    const proposal = await proposeAdvancedTrade(f.owner.id, f.input, f.at);
    await expect(proposeAdvancedTrade(f.users[1].id, { ...f.input, proposalId: proposal.id, expectedRevision: 1 }, f.at)).rejects.toThrow(/Only the proposer/);
    await expect(closeAdvancedTrade(f.users[1].id, proposal.id, "VETO", "Unauthorized veto request", f.at)).rejects.toThrow(/commissioner/);
    await closeAdvancedTrade(f.owner.id, proposal.id, "CANCEL", "Proposer withdrew offer", f.at);
  } finally { await f.cleanup(); }
});
it("expires pending offers and releases accepted money exactly once without moving assets", async () => {
  const f = await fixture();
  try {
    const sport = f.sports[0];
    const accounts = await db.$transaction(async (tx) => {
      const rows = [];
      for (const team of f.teams) rows.push(await accountForWaiver(tx, f.league.id, sport.id, team.id));
      return rows;
    });
    const input = { ...f.input, participants: f.teams.slice(0, 2).map(({ id }) => id), assets: [{ type: "FAAB" as const, from: f.teams[0].id, to: f.teams[1].id, leagueSportId: sport.id, amount: 40 }], expiresAt: new Date(+f.at + 2 * 86400000) };
    const pending = await proposeAdvancedTrade(f.owner.id, input, f.at);
    const accepted = await proposeAdvancedTrade(f.owner.id, input, f.at);
    for (const user of f.users.slice(0, 2)) await acceptAdvancedTrade(user.id, accepted.id, 1, f.at);
    expect((await db.faabAccount.findUniqueOrThrow({ where: { id: accounts[0].id } })).reserved).toBe(40);
    await processAdvancedTrades(input.expiresAt);
    await processAdvancedTrades(new Date(+input.expiresAt + 60000));
    const closed = await db.tradeProposal.findMany({ where: { id: { in: [pending.id, accepted.id] } } });
    expect(closed.map(({ status }) => status)).toEqual(["EXPIRED", "EXPIRED"]);
    const funds = await db.faabAccount.findMany({ where: { leagueId: f.league.id } });
    expect(funds.every(({ balance, reserved }) => balance === 100 && reserved === 0)).toBe(true);
    expect(await db.fantasyTransaction.count({ where: { leagueId: f.league.id, type: "TRADE" } })).toBe(0);
  } finally { await f.cleanup(); }
});
it("allows dynasty offseason players, rejects redraft offseason assets and revalidates each sport deadline", async () => {
  const f = await fixture();
  try {
    await configureTradeReview(f.owner.id, f.league.id, 0);
    const late = new Date(+f.at + 61 * 86400000);
    const input = { ...f.input, expiresAt: new Date(+late + 86400000) };
    const allowed = await proposeAdvancedTrade(f.owner.id, input, late);
    await closeAdvancedTrade(f.owner.id, allowed.id, "CANCEL", "Offseason acceptance checked", late);
    await db.league.update({ where: { id: f.league.id }, data: { format: "REDRAFT" } });
    await expect(proposeAdvancedTrade(f.owner.id, input, late)).rejects.toThrow(/Redraft offseason/);
    await db.league.update({ where: { id: f.league.id }, data: { format: "DYNASTY" } });
    const pending = await proposeAdvancedTrade(f.owner.id, f.input, f.at);
    await db.leagueSportSeason.updateMany({ where: { leagueSportId: f.sports.find(({ sport }) => sport === "NBA")!.id }, data: { tradeDeadlineAt: f.at } });
    await expect(acceptAdvancedTrade(f.users[1].id, pending.id, 1, f.at)).rejects.toThrow(/deadline has passed/);
    expect(await db.tradeProposalAcceptance.count({ where: { revision: { proposalId: pending.id } } })).toBe(0);
    await processAdvancedTrades(f.at);
    expect((await db.tradeProposal.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("INVALIDATED");
  } finally { await f.cleanup(); }
});
