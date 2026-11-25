import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { commissionerRelease } from "@/server/roster-administration";
import { currentCompliance, setLineupSlot } from "@/server/rosters";

const db = getDatabase();
afterAll(() => db.$disconnect());

it("permits incremental legal overflow repair and records explicit commissioner releases once", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Overflow repair ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, historical: true, seasonYear: 2084 });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const team = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id } });
    const roster = await db.fantasyRoster.findFirstOrThrow({ where: { teamId: team.id } });
    const entries = [];
    for (let index = 1; index <= 8; index++) {
      const player = await db.player.create({ data: { sport: "NFL", displayName: `Overflow ${randomUUID()}`, isSynthetic: true } });
      entries.push(await db.rosterEntry.create({ data: { leagueId: league.id, teamId: team.id, rosterId: roster.id, playerId: player.id, sport: "NFL", seasonId: sport.seasonId, slot: "BENCH", slotIndex: index } }));
    }
    expect((await currentCompliance(db, team.id, new Date())).violationCount).toBe(3);
    await setLineupSlot(user.id, league.id, entries[7].id, "UNIVERSAL_BENCH", "NFL", null, 1);
    expect((await currentCompliance(db, team.id, new Date())).violationCount).toBe(2);
    await expect(commissionerRelease(randomUUID(), league.id, entries[6].id, "Unauthorized release attempt")).rejects.toThrow(/commissioner/i);
    await commissionerRelease(user.id, league.id, entries[6].id, "Explicit fixture overflow correction");
    await commissionerRelease(user.id, league.id, entries[6].id, "Idempotent repeat of correction");
    expect(await db.commissionerAuditEvent.count({ where: { targetId: entries[6].id, action: "RELEASE_ROSTER_PLAYER" } })).toBe(1);
    expect(await db.fantasyTransaction.count({ where: { leagueId: league.id, playerId: entries[6].playerId, type: "DROP" } })).toBe(1);
    expect((await currentCompliance(db, team.id, new Date())).violationCount).toBe(1);
    await db.rosterEntry.update({ where: { id: entries[5].id }, data: { lockedAt: new Date() } });
    await expect(commissionerRelease(user.id, league.id, entries[5].id, "Locked fixture correction refused")).rejects.toThrow(/locked/i);
    expect((await db.rosterEntry.findUniqueOrThrow({ where: { id: entries[5].id } })).releasedAt).toBeNull();
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
