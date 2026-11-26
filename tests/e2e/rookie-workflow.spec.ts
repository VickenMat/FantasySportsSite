import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { createLeague, transitionSportSeason } from "../../src/server/league";
import { provisionFutureDraftPicks } from "../../src/server/dynasty-picks";
import { recordRookieEligibility } from "../../src/server/rookies";
import { finalizeRookiePlacements } from "../helpers/rookie-placements";

test("commissioner executes reverse finalized rookie order through the website and sees consumed entitlements", async ({ page }) => {
  const db = getDatabase();
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Isolated rookie workflow ${randomUUID()}`, sports: ["NFL"], format: "DYNASTY", maxTeams: 2, fillWithComputers: true, historical: true, seasonYear: 2060 });
  try {
    await db.league.update({ where: { id: league.id }, data: { status: "ACTIVE" } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id } });
    await provisionFutureDraftPicks(user.id, league.id, sport.id);
    const teams = await db.fantasyTeam.findMany({ where: { leagueId: league.id }, orderBy: { draftSlot: "asc" } });
    await finalizeRookiePlacements(sport.id, teams.map(({ id }) => id));
    await transitionSportSeason(user.id, league.id, "NFL", 2061);
    const current = await db.leagueSport.findUniqueOrThrow({ where: { id: sport.id } });
    for (let index = 0; index < 4; index++) {
      const player = await db.player.create({ data: { sport: "NFL", displayName: `Isolated verified rookie ${index} ${randomUUID()}` } });
      await recordRookieEligibility({ playerId: player.id, seasonId: current.seasonId, sport: "NFL", eligible: true,
        effectiveAt: new Date("2020-01-01"), knownAt: new Date("2020-01-01"), provider: "isolated-browser-fixture", externalId: randomUUID(), sourceRecord: { synthetic: true } });
    }
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(process.env.DEMO_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");
    await page.goto(`/leagues/${league.id}/picks?sport=NFL`);
    await page.getByText("Start rookie draft", { exact: true }).first().click();
    await expect(page.getByLabel("Order method")).toHaveCount(0);
    await page.getByRole("combobox", { name: /^Rounds/ }).selectOption("2");
    await page.getByLabel("Reason", { exact: true }).fill("Explicit isolated browser rookie order");
    await page.getByRole("button", { name: "Start rookie draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Rookie draft active");
    await page.getByRole("link", { name: "Open NFL draft room" }).click();
    await expect(page.getByRole("heading", { name: "NFL rookie draft", exact: true })).toBeVisible();
    for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "Auto-pick current team" }).click();
    await expect.poll(() => db.draft.count({ where: { leagueId: league.id, kind: "ROOKIE", status: "COMPLETE" } })).toBe(1);
    expect(await db.rosterEntry.count({ where: { leagueId: league.id, releasedAt: null } })).toBe(4);
    await page.goto(`/leagues/${league.id}/picks?sport=NFL`);
    await expect(page.getByRole("cell", { name: /^Consumed/ })).toHaveCount(4);
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
