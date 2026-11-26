import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { createLeague } from "../../src/server/league";
import { provisionFutureDraftPicks } from "../../src/server/dynasty-picks";
import { recordRookieEligibility } from "../../src/server/rookies";
import { processScheduledDrafts } from "../../src/server/draft-plans";
import { importProfessionalSchedules } from "../../src/server/scheduling";
import { finalizeRookiePlacements } from "../helpers/rookie-placements";

test("traditional dynasty rolls one competitive sport independently and completes its reverse-placement scheduled rookie draft", async ({ page }) => {
  const db = getDatabase();
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  await importProfessionalSchedules({ provider: `rookie-competitive-browser-${randomUUID()}`, sourceName: "Isolated competitive rollover and rookie boundary fixture", sourceVersion: "1", retrievedAt: "2020-01-01", seasons: [
    { sport: "NFL", startYear: 2026, label: "2026", status: "AVAILABLE", regularSeasonStartsAt: "2026-01-01", regularSeasonEndsAt: "2026-08-01", postseasonEndsAt: "2026-09-01" },
    { sport: "NFL", startYear: 2027, label: "2027", status: "AVAILABLE", regularSeasonStartsAt: "2027-09-01", regularSeasonEndsAt: "2028-01-10", postseasonEndsAt: "2028-02-10" },
    { sport: "NBA", startYear: 2026, label: "2026-27", status: "AVAILABLE", regularSeasonStartsAt: "2026-10-01", regularSeasonEndsAt: "2027-04-10", postseasonEndsAt: "2027-06-10" },
  ] });
  const league = await createLeague(user.id, { name: `Isolated rookie workflow ${randomUUID()}`, sports: ["NFL", "NBA"], format: "DYNASTY", maxTeams: 2, fillWithComputers: true }, new Date("2025-12-01"));
  try {
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    const nbaBefore = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NBA" } });
    await provisionFutureDraftPicks(user.id, league.id, sport.id);
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    await finalizeRookiePlacements(sport.id, teams.map(({ id }) => id));
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(process.env.DEMO_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");
    await page.goto(`/leagues/${league.id}/settings?sport=NFL`);
    await page.getByRole("button", { name: "Assign next source-backed season", exact: true }).click();
    await expect(page.getByRole("button", { name: "Activate NFL 2027", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Activate NFL 2027", exact: true }).click();
    await expect.poll(() => db.leagueSport.findUniqueOrThrow({ where: { id: sport.id }, include: { season: true } }).then(({ season }) => season.startYear)).toBe(2027);
    expect(await db.leagueSport.findUniqueOrThrow({ where: { id: nbaBefore.id } })).toEqual(nbaBefore);
    const current = await db.leagueSport.findUniqueOrThrow({ where: { id: sport.id } });
    for (let index = 0; index < 4; index++) {
      const player = await db.player.create({ data: { sport: "NFL", displayName: `Isolated verified rookie ${index} ${randomUUID()}` } });
      await recordRookieEligibility({ playerId: player.id, seasonId: current.seasonId, sport: "NFL", eligible: true,
        effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-browser-fixture", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    }
    await page.goto(`/leagues/${league.id}/picks?sport=NFL`);
    await page.getByText("Schedule rookie draft", { exact: true }).first().click();
    await expect(page.getByLabel("Order method")).toHaveCount(0);
    await page.getByRole("combobox", { name: /^Rounds/ }).selectOption("2");
    await page.getByLabel("Rookie date and time (UTC)").fill(new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16));
    await page.getByLabel("Reason", { exact: true }).fill("Explicit isolated browser rookie order");
    await page.getByRole("button", { name: "Schedule rookie draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Rookie draft scheduled");
    const plan = await db.draftPlan.findFirstOrThrow({ where: { leagueId: league.id, kind: "ROOKIE" } });
    await processScheduledDrafts(plan.scheduledAt!);
    await page.getByRole("link", { name: "Open NFL draft room" }).click();
    await expect(page.getByRole("heading", { name: "NFL rookie draft", exact: true })).toBeVisible();
    for (let index = 0; index < 4; index++) {
      await page.getByRole("button", { name: "Auto-pick current team" }).click();
      await expect.poll(() => db.draftPick.count({ where: { draftId: plan.draftId! } })).toBe(index + 1);
      await page.reload();
    }
    await expect.poll(() => db.draft.count({ where: { leagueId: league.id, kind: "ROOKIE", status: "COMPLETE" } })).toBe(1);
    expect(await db.rosterEntry.count({ where: { leagueId: league.id, releasedAt: null } })).toBe(4);
    await page.goto(`/leagues/${league.id}/picks?sport=NFL`);
    await expect(page.getByRole("cell", { name: /^Consumed/ })).toHaveCount(4);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
