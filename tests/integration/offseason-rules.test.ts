import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { currentCompliance } from "@/server/rosters";
import { recordAvailabilityEvidence } from "@/server/lineup-snapshots";
import { importProfessionalSchedules } from "@/server/scheduling";
const db = getDatabase();
afterAll(() => db.$disconnect());
it("uses verified professional offseason bounds for IR without inferring missing dates or retirement", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Offseason IR fixture ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, historical: true, seasonYear: 2079 });
  try {
    const team = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const roster = await db.fantasyRoster.findFirstOrThrow({ where: { leagueId: league.id } });
    const player = await db.player.create({ data: { sport: "NFL", displayName: `Verified IR fixture ${randomUUID()}`, isSynthetic: true } });
    await db.rosterEntry.create({ data: { leagueId: league.id, teamId: team.id, rosterId: roster.id, playerId: player.id, sport: "NFL", seasonId: sport.seasonId, slot: "UNIVERSAL_IR", slotIndex: 1 } });
    await recordAvailabilityEvidence({ playerId: player.id, designation: "OUT", irEligible: true, effectiveAt: new Date("2079-01-01"), knownAt: new Date("2079-01-01"), provider: "isolated-offseason", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    expect((await currentCompliance(db, team.id, new Date("2079-08-30"))).state).toBe("COMPLIANT");
    await importProfessionalSchedules({ provider: `offseason-ir-${randomUUID()}`, sourceName: "Explicit synthetic professional boundaries", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NFL", startYear: 2079, label: "2079", status: "AVAILABLE", regularSeasonStartsAt: "2079-09-01", regularSeasonEndsAt: "2080-01-10", postseasonEndsAt: "2080-02-01" }] });
    expect((await currentCompliance(db, team.id, new Date("2079-08-30"))).state).toBe("IR_INELIGIBLE");
    expect((await currentCompliance(db, team.id, new Date("2079-09-01"))).state).toBe("COMPLIANT");
    expect(await db.rosterEntry.count({ where: { teamId: team.id, releasedAt: null } })).toBe(1);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
