import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague, transitionSportSeason } from "@/server/league";
import { accountForWaiver, reserveFaab, resetSportFaab } from "@/server/faab";

const db = getDatabase();
afterAll(() => db.$disconnect());

it("resets only the rolled sport, cancels its pending reservations and journals an idempotent reset", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `FAAB rollover ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2065 });
  try {
    const team = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id } });
    const sports = await db.leagueSport.findMany({ where: { leagueId: league.id } });
    const nfl = sports.find(({ sport }) => sport === "NFL")!;
    const nba = sports.find(({ sport }) => sport === "NBA")!;
    const roster = await db.fantasyRoster.findFirstOrThrow({ where: { teamId: team.id, sport: "NFL" } });
    const player = await db.player.create({ data: { sport: "NFL", displayName: `FAAB rollover ${randomUUID()}`, isSynthetic: true } });
    const claim = await db.$transaction(async (tx) => {
      const account = await accountForWaiver(tx, league.id, nfl.id, team.id);
      const claim = await tx.waiverClaim.create({ data: { leagueId: league.id, leagueSportId: nfl.id, rosterId: roster.id, sport: "NFL", teamId: team.id,
        addPlayerId: player.id, bid: 25, priority: 1, processAt: new Date(Date.now() + 86400000), faabAccountId: account.id } });
      await reserveFaab(tx, account, claim.id, 25); return claim;
    });
    const nbaBefore = await db.faabAccount.findFirstOrThrow({ where: { leagueSportId: nba.id, teamId: team.id } });
    await transitionSportSeason(user.id, league.id, "NFL", 2066);
    await transitionSportSeason(user.id, league.id, "NFL", 2066);
    expect(await db.waiverClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({ status: "CANCELLED" });
    const account = await db.faabAccount.findUniqueOrThrow({ where: { id: claim.faabAccountId! } });
    expect(account).toMatchObject({ balance: 100, reserved: 0 });
    expect(await db.faabAccount.findUniqueOrThrow({ where: { id: nbaBefore.id } })).toEqual(nbaBefore);
    const current = await db.leagueSport.findUniqueOrThrow({ where: { id: nfl.id } });
    await db.$transaction((tx) => resetSportFaab(tx, league.id, nfl.id, current.seasonId), { isolationLevel: "Serializable" });
    expect(await db.faabLedgerEntry.count({ where: { accountId: account.id, type: "RESET" } })).toBe(1);
    const deltas = await db.faabLedgerEntry.aggregate({ where: { accountId: account.id }, _sum: { balanceDelta: true, reservedDelta: true } });
    expect(deltas._sum).toEqual({ balanceDelta: account.balance, reservedDelta: account.reserved });
    expect(await db.futureDraftPick.count({ where: { leagueSportId: nfl.id } })).toBe(24);
    expect(await db.futureDraftPick.count({ where: { leagueSportId: nba.id } })).toBe(0);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});

it("does not reset universal cycle FAAB at an independent sport rollover", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Universal rollover ${randomUUID()}`, sports: ["NFL", "NBA"], maxTeams: 2, historical: true, seasonYear: 2067, faabScope: "UNIVERSAL" });
  try {
    const before = await db.faabAccount.findMany({ where: { leagueId: league.id } });
    await transitionSportSeason(user.id, league.id, "NFL", 2068);
    expect(await db.faabAccount.findMany({ where: { leagueId: league.id } })).toEqual(before);
    expect(await db.faabLedgerEntry.count({ where: { account: { leagueId: league.id }, type: "RESET" } })).toBe(0);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
