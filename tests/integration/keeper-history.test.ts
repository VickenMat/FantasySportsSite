import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague, joinPublicLeague, selectKeeper, transitionSportSeason } from "@/server/league";
import { createDraft } from "@/server/draft";
import { proposeTrade, respondToTrade } from "@/server/trades";
import { dropPlayer } from "@/server/rosters";

const db = getDatabase();
afterAll(() => db.$disconnect());

it("preserves paid-round costs through trade, release and reacquisition and enforces the three-year maximum", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const partner = await db.user.create({ data: { id: randomUUID(), name: "Keeper partner", email: `${randomUUID()}@example.test` } });
  const league = await createLeague(user.id, { name: `Keeper history ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, visibility: "PUBLIC", format: "REDRAFT", historical: true, seasonYear: 2062, keeperLimits: { NFL: 2 } });
  try {
    await joinPublicLeague(partner.id, league.id);
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    await db.leagueSport.update({ where: { id: sport.id }, data: { draftRounds: 4 } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id } });
    const original = teams.find(({ managerId }) => managerId === user.id)!;
    const destination = teams.find(({ managerId }) => managerId === partner.id)!;
    const oldRoster = await db.fantasyRoster.findFirstOrThrow({ where: { teamId: original.id } });
    const newRoster = await db.fantasyRoster.findFirstOrThrow({ where: { teamId: destination.id } });
    const player = await db.player.create({ data: { sport: "NFL", displayName: `Keeper ${randomUUID()}`, isSynthetic: true } });
    const entry = await db.rosterEntry.create({ data: { leagueId: league.id, teamId: original.id, rosterId: oldRoster.id, playerId: player.id, sport: "NFL", seasonId: sport.seasonId, slot: "BENCH", slotIndex: 1 } });
    const draft = await db.draft.create({ data: { leagueId: league.id, leagueSportId: sport.id, sport: "NFL", seasonId: sport.seasonId, rounds: 4, order: teams.map(({ id }) => id), status: "COMPLETE" } });
    await db.draftPick.create({ data: { draftId: draft.id, playerId: player.id, teamId: original.id, overall: 6, round: 3, roundPick: 2 } });
    expect((await selectKeeper(user.id, league.id, "NFL", player.id)).draftCost).toBe(2);
    const trade = await proposeTrade(user.id, { leagueId: league.id, recipientTeamId: destination.id, offerPlayerIds: [player.id], requestPlayerIds: [] });
    await respondToTrade(partner.id, trade.id, "ACCEPT");
    expect(await selectKeeper(partner.id, league.id, "NFL", player.id)).toMatchObject({ teamId: destination.id, draftCost: 2 });
    await dropPlayer(partner.id, league.id, player.id, "NFL");
    // Explicit fixture reacquisition after the hold: history remains in the released entry.
    await db.rosterEntry.create({ data: { leagueId: league.id, teamId: destination.id, rosterId: newRoster.id, playerId: player.id, sport: "NFL", seasonId: sport.seasonId, slot: "BENCH", slotIndex: 1 } });
    expect((await selectKeeper(partner.id, league.id, "NFL", player.id)).draftCost).toBe(2);
    expect((await db.rosterEntry.findUniqueOrThrow({ where: { id: entry.id } })).releasedAt).not.toBeNull();
    await transitionSportSeason(user.id, league.id, "NFL", 2063);
    const nextDraft = await createDraft(user.id, league.id, "NFL");
    const snapshot = JSON.parse(nextDraft.orderProvenance!);
    expect(snapshot.slots.some((slot: { teamId: string; round: number }) => slot.teamId === destination.id && slot.round === 2)).toBe(false);
    expect(snapshot.slots.some((slot: { teamId: string; round: number }) => slot.teamId === original.id && slot.round === 2)).toBe(true);
    expect((await selectKeeper(partner.id, league.id, "NFL", player.id)).draftCost).toBe(1);
    await db.draft.update({ where: { id: nextDraft.id }, data: { status: "COMPLETE" } });
    await transitionSportSeason(user.id, league.id, "NFL", 2064);
    await expect(selectKeeper(partner.id, league.id, "NFL", player.id)).rejects.toThrow(/three-year maximum/i);
  } finally { await db.league.delete({ where: { id: league.id } }); await db.user.delete({ where: { id: partner.id } }); }
});
