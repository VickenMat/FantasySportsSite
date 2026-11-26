import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { createLeague, leagueContext, resizeLeague, transitionSportSeason } from "@/server/league";
import { archiveFranchise, configureFutureCompetition, transferFranchiseOwnership } from "@/server/league-administration";
import { standings } from "@/server/matchups";
import { assignNextSportSeason, importProfessionalSchedules } from "@/server/scheduling";
import { finalizeRookiePlacements } from "../helpers/rookie-placements";
const db = getDatabase();
afterAll(() => db.$disconnect());
it("audits abandoned franchise ownership without changing franchise, pick, roster or result identities", async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const replacement = await db.user.create({ data: { id: randomUUID(), name: "Replacement fixture", email: `${randomUUID()}@example.test` } });
  const league = await createLeague(owner.id, { name: `Ownership fixture ${randomUUID()}`, historical: true, seasonYear: 2078, sports: ["NBA"], maxTeams: 2, fillWithComputers: true });
  try {
    const team = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, isComputer: true } });
    await expect(transferFranchiseOwnership(replacement.id, league.id, team.id, replacement.email, "Abandoned manager fixture")).rejects.toThrow(/commissioner/);
    const updated = await transferFranchiseOwnership(owner.id, league.id, team.id, replacement.email, "Explicit abandoned franchise transfer fixture");
    expect(updated).toMatchObject({ id: team.id, name: team.name, draftSlot: team.draftSlot, managerId: replacement.id, isComputer: false });
    expect(await db.fantasyTeam.count({ where: { leagueId: league.id } })).toBe(2);
    expect(await db.commissionerAuditEvent.count({ where: { leagueId: league.id, action: "TRANSFER_FRANCHISE_OWNERSHIP" } })).toBe(1);
    await transferFranchiseOwnership(owner.id, league.id, team.id, replacement.email, "Safe repeated transfer fixture");
    expect(await db.commissionerAuditEvent.count({ where: { leagueId: league.id, action: "TRANSFER_FRANCHISE_OWNERSHIP" } })).toBe(1);
  } finally { await db.league.delete({ where: { id: league.id } }); await db.user.delete({ where: { id: replacement.id } }); }
});
it("versions future configuration and independently rolls a competitive sport only after its verified boundary and final results", async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  await importProfessionalSchedules({ provider: `competitive-rollover-${randomUUID()}`, sourceName: "Explicit isolated source-boundary fixture", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [2094, 2095].map((year) => ({ sport: "NFL", startYear: year, label: String(year), status: "AVAILABLE", regularSeasonStartsAt: `${year}-09-01`, regularSeasonEndsAt: `${year + 1}-01-10`, postseasonEndsAt: `${year + 1}-02-10` })) });
  const league = await createLeague(owner.id, { name: `Competitive rollover fixture ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, fillWithComputers: true, format: "DYNASTY" }, new Date("2094-01-01"));
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const next = await assignNextSportSeason(owner.id, league.id, "NFL");
    const future = await configureFutureCompetition(owner.id, league.id, next.championshipCycleId, { consolationEnabled: false }, "Explicit future cycle fixture settings");
    expect(future.version).toBe(1);
    const second = await configureFutureCompetition(owner.id, league.id, next.championshipCycleId, { championPoints: 7 }, "Second immutable future settings fixture");
    expect(second).toMatchObject({ version: 2, consolationEnabled: false, championPoints: 7 });
    const current = await db.leagueSportSeason.findFirstOrThrow({ where: { leagueSportId: sport.id, seasonId: sport.seasonId } });
    await expect(configureFutureCompetition(owner.id, league.id, current.championshipCycleId, { championPoints: 9 }, "Cannot rewrite the current cycle")).rejects.toThrow(/future planning cycle/);
    await expect(transitionSportSeason(owner.id, league.id, "NFL", 2095, new Date("2095-03-01"))).rejects.toThrow(/finalized results/);
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id } });
    await finalizeRookiePlacements(sport.id, teams.map(({ id }) => id));
    await expect(transitionSportSeason(owner.id, league.id, "NFL", 2095, new Date("2095-01-20"))).rejects.toThrow(/rollover boundary/);
    await transitionSportSeason(owner.id, league.id, "NFL", 2095, new Date("2095-03-01"));
    await transitionSportSeason(owner.id, league.id, "NFL", 2095, new Date("2095-03-01"));
    expect((await db.leagueSport.findUniqueOrThrow({ where: { id: sport.id } })).seasonId).toBe(next.seasonId);
    expect((await db.sportCompetition.findUniqueOrThrow({ where: { leagueSportSeasonId: next.id } })).configSnapshotId).toBe(second.id);
    expect(await db.commissionerAuditEvent.count({ where: { leagueId: league.id, action: "SPORT_ROLLOVER" } })).toBe(1);
    expect(await db.futureDraftPick.count({ where: { leagueSportId: sport.id } })).toBe(24);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});

it("archives an empty franchise only in verified offseasons while preserving its original results and audit", async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(owner.id, { name: `Archive fixture ${randomUUID()}`, historical: true, seasonYear: 2081, sports: ["NFL"], format: "REDRAFT", maxTeams: 4, fillWithComputers: true });
  try {
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    const target = teams[3]; const at = new Date("2082-03-01");
    await expect(archiveFranchise(randomUUID(), league.id, target.id, "Unauthorized archive fixture", at)).rejects.toThrow(/commissioner/);
    await expect(archiveFranchise(owner.id, league.id, target.id, "Missing verified offseason fixture", at)).rejects.toThrow(/source-verified offseason/);
    await importProfessionalSchedules({ provider: `archive-boundary-${randomUUID()}`, sourceName: "Isolated archive evidence", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NFL", startYear: 2081, label: "2081", status: "AVAILABLE", regularSeasonStartsAt: "2081-09-01", regularSeasonEndsAt: "2082-01-10", postseasonEndsAt: "2082-02-10" }] });
    await finalizeRookiePlacements(sport.id, teams.map(({ id }) => id));
    const competition = await db.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id }, include: { leagueSportSeason: true } });
    await db.championshipCycle.update({ where: { id: competition.leagueSportSeason.championshipCycleId }, data: { status: "COMPLETE" } });
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    await expect(archiveFranchise(owner.id, league.id, target.id, "In season archive rejected", new Date("2081-10-01"))).rejects.toThrow(/offseason/);
    await expect(resizeLeague(owner.id, league.id, 6)).rejects.toThrow(/before drafting/);
    const before = await db.sportFinalPlacement.findMany({ where: { sportCompetitionId: competition.id }, orderBy: { placement: "asc" } });
    const event = await archiveFranchise(owner.id, league.id, target.id, "Offseason empty franchise retirement fixture", at);
    expect((await archiveFranchise(owner.id, league.id, target.id, "Idempotent archived franchise fixture", at)).id).toBe(event.id);
    expect(await db.fantasyTeam.count({ where: { leagueId: league.id } })).toBe(4);
    expect((await leagueContext(owner.id, league.id))!.league.teams.map(({ id }) => id)).toEqual(teams.slice(0, 3).map(({ id }) => id));
    expect((await db.league.findUniqueOrThrow({ where: { id: league.id } })).maxTeams).toBe(3);
    expect(await db.sportFinalPlacement.findMany({ where: { sportCompetitionId: competition.id }, orderBy: { placement: "asc" } })).toEqual(before);
    await expect(db.commissionerAuditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);
    // A prior four-team playoff snapshot cannot silently become a future three-team bracket.
    await importProfessionalSchedules({ provider: `archive-next-boundary-${randomUUID()}`, sourceName: "Isolated archived-league next season", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [{ sport: "NFL", startYear: 2082, label: "2082", status: "AVAILABLE", regularSeasonStartsAt: "2082-09-01", regularSeasonEndsAt: "2083-01-10", postseasonEndsAt: "2083-02-10" }] });
    await db.league.update({ where: { id: league.id }, data: { isHistorical: false } });
    expect(await standings(league.id, "NFL")).toHaveLength(4);
    await db.leagueSportSeason.update({ where: { id: competition.leagueSportSeason.id }, data: { rolloverEligibleAt: new Date("2082-02-10") } });
    const next = await assignNextSportSeason(owner.id, league.id, "NFL");
    await expect(transitionSportSeason(owner.id, league.id, "NFL", 2082, at)).rejects.toThrow(/future competition configuration/);
    expect((await db.leagueSport.findUniqueOrThrow({ where: { id: sport.id } })).seasonId).toBe(sport.seasonId);
    await configureFutureCompetition(owner.id, league.id, next.championshipCycleId, { playoffTeams: 2, playoffWeeks: 1 }, "Reconcile future playoffs after audited franchise archival");
    await transitionSportSeason(owner.id, league.id, "NFL", 2082, at);
    expect(await standings(league.id, "NFL")).toHaveLength(3);
    const { configureDraftPlan } = await import("@/server/draft-plans");
    const plan = await configureDraftPlan(owner.id, { leagueId: league.id, leagueSportId: sport.id, method: "SNAKE", orderMethod: "CUSTOM", order: teams.slice(0, 3).map(({ id }) => id), rounds: 1, secondsPerPick: 30, scheduledAt: null, timezone: "UTC" });
    expect(plan.order).not.toContain(target.id);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
