import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { browsePlayers } from "@/server/player-browser";
import { addFreeAgent } from "@/server/rosters";
import { listDemoPlayers } from "@/server/dashboard";
import { recordRookieEligibility } from "@/server/rookies";
const db = getDatabase();
afterAll(() => db.$disconnect());
it("filters canonical ownership, holds, positions and known scores before pagination without treating unknown as zero", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const prefix = `Isolated browser ${randomUUID()}`;
  const league = await createLeague(user.id, { name: prefix, sports: ["NFL", "NBA"], maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2075 });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    const other = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, isComputer: true } });
    const roster = await db.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: other.id, leagueSportId: sport.id } } });
    const club = await db.proTeam.create({ data: { sport: "NFL", provider: "isolated-browser", externalId: randomUUID(), displayName: "Synthetic browser club" } });
    const game = await db.game.create({ data: { sport: "NFL", seasonId: sport.seasonId, provider: "isolated-browser", externalId: randomUUID(), phase: "REGULAR" } });
    await db.gameTeam.create({ data: { gameId: game.id, teamId: club.id } });
    const batch = await db.importBatch.create({ data: { sport: "NFL", provider: "isolated-browser", contentHash: randomUUID(), sourceName: "Synthetic canonical-browser fixture", importerVersion: "fixture", summary: {} } });
    const players = [];
    for (const [index, total] of [40n, 90n, 0n, null].entries()) {
      const player = await db.player.create({ data: { sport: "NFL", displayName: `${prefix} ${index}` } });
      const stat = await db.playerGameStat.create({ data: { gameId: game.id, playerId: player.id, teamId: club.id, importBatchId: batch.id, provider: "isolated-browser", role: "FOOTBALL", revision: 1, contentHash: randomUUID(), sourceLine: index + 1, observedPositions: [index === 1 ? "WR" : index === 3 ? "RB" : "QB"], normalized: {}, raw: {} } });
      if (total !== null) {
        const ledger = await db.scoreLedger.create({ data: { gameId: game.id, playerId: player.id, presetId: league.presetId, role: "FOOTBALL" } });
        await db.scoreLedgerEntry.create({ data: { ledgerId: ledger.id, statId: stat.id, sequence: 1, totalTenths: total, reason: "Explicit synthetic analytics score", engineVersion: "fixture", ruleHash: "fixture", inputHash: randomUUID(), lineItems: [], missingStats: [] } });
      }
      players.push(player);
    }
    await db.rosterEntry.create({ data: { leagueId: league.id, teamId: other.id, rosterId: roster.id, playerId: players[0].id, sport: "NFL", seasonId: sport.seasonId, slot: "BENCH", slotIndex: 1 } });
    await db.rosterEntry.create({ data: { leagueId: league.id, teamId: other.id, rosterId: roster.id, playerId: players[1].id, sport: "NFL", seasonId: sport.seasonId, slot: "BENCH", slotIndex: 1, releasedAt: new Date(Date.now() - 3600000) } });
    const input = { sport: "NFL", search: prefix, presetId: league.presetId, seasonId: sport.seasonId, availability: "ALL" as const };
    expect((await browsePlayers(league.id, input)).total).toBe(4);
    const defaultOrder=await browsePlayers(league.id,{...input,pageSize:1});
    expect(defaultOrder.items[0].id).toBe(players[0].id);
    expect(defaultOrder.projections.get(players[0].id)).toBeNull();
    expect(defaultOrder.rosterPercent.get(players[0].id)).toBe(50);
    const multi=await browsePlayers(league.id,{...input,positions:["QB","WR"],pageSize:1,sort:"PTS"});
    expect(multi.total).toBe(3);expect(multi.items[0].id).toBe(players[1].id);

    expect((await browsePlayers(league.id, { ...input, availability: "ROSTERED" })).items.map(({ id }) => id)).toEqual([players[0].id]);
    expect((await browsePlayers(league.id, { ...input, availability: "WAIVERS" })).items.map(({ id }) => id)).toEqual([players[1].id]);
    expect((await browsePlayers(league.id, { ...input, availability: "FREE_AGENTS" })).items.map(({ id }) => id)).toEqual([players[2].id, players[3].id]);
    expect((await browsePlayers(league.id, { ...input, position: "QB" })).items.map(({ id }) => id)).toEqual([players[0].id, players[2].id]);
    const first = await browsePlayers(league.id, { ...input, sort: "PTS", points: "KNOWN", pageSize: 1, page: 1 });
    expect(first).toMatchObject({ total: 3, pages: 3 });
    expect(first.items[0].id).toBe(players[1].id);
    expect((await browsePlayers(league.id, { ...input, sort: "PTS", points: "KNOWN", pageSize: 1, page: 3 })).items[0].id).toBe(players[2].id);
    const unknown = await browsePlayers(league.id, { ...input, points: "UNKNOWN" });
    expect(unknown.items.map(({ id }) => id)).toEqual([players[3].id]);
    expect(unknown.statistics.get(players[3].id)?.totalTenths).toBeNull();
    expect((await browsePlayers(league.id, { ...input, page: Number.NaN })).page).toBe(1);
    await recordRookieEligibility({ playerId: players[0].id, seasonId: sport.seasonId, sport: "NFL", eligible: false, effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-browser", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    await expect(addFreeAgent(user.id, league.id, players[0].id, "NFL")).rejects.toThrow();
    expect((await db.rosterEntry.findFirstOrThrow({ where: { leagueId: league.id, playerId: players[0].id, releasedAt: null } })).teamId).toBe(other.id);
    expect(await listDemoPlayers()).toHaveLength(8);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
