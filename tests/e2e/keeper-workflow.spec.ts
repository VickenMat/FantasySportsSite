import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { createLeague } from "../../src/server/league";
import { processScheduledDrafts } from "../../src/server/draft-plans";

test.use({ timezoneId: "UTC" });
test("redraft keeper survives an independent sport transition and pays its recorded snake round", async ({ page }) => {
  const db = getDatabase(); const owner = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(owner.id, { name: `Keeper browser fixture ${randomUUID()}`, sports: ["NFL", "NBA"], format: "REDRAFT", historical: true, seasonYear: 2077, maxTeams: 2, fillWithComputers: true, keeperLimits: { NFL: 1 } });
  const extras = Array.from({ length: 4 }, () => ({ id: randomUUID(), sport: "NFL" as const, displayName: `Isolated keeper player ${randomUUID()}`, isDemo: true }));
  await db.player.createMany({ data: extras });
  try {
    await page.goto("/sign-in"); await page.getByLabel("Email").fill(process.env.DEMO_EMAIL!); await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL("/dashboard");
    const nfl = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NFL" } });
    const nbaBefore = await db.leagueSport.findFirstOrThrow({ where: { leagueId: league.id, sport: "NBA" } });
    for (const season of [2077, 2078]) {
      await page.goto(`/leagues/${league.id}/draft?sport=NFL`);
      await page.getByLabel("Draft rounds per franchise").fill("2"); await page.getByLabel("Draft timer (seconds)").fill("30");
      await page.getByLabel(/Draft date and time/).fill(new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16));
      await page.getByRole("button", { name: "Save Draft Order and Schedule" }).click(); await expect(page.getByRole("status")).toContainText("saved for every league member");
      const plan = await db.draftPlan.findFirstOrThrow({ where: { leagueId: league.id, leagueSportId: nfl.id, season: { startYear: season } } });
      await processScheduledDrafts(plan.scheduledAt!); await page.reload();
      for (let pick = 0; pick < (season === 2077 ? 4 : 3); pick++) {
        await page.getByRole("button", { name: "Auto-pick current team" }).click();
        await expect.poll(() => db.draftPick.count({ where: { draftId: plan.draftId! } })).toBe(pick + 1);
        await page.reload();
        if (season === 2078 && pick === 0) await expect(page.getByText("Round", { exact: true }).locator("..").getByText("2", { exact: true })).toBeVisible();
      }
      await expect.poll(() => db.draft.count({ where: { id: plan.draftId!, status: "COMPLETE" } })).toBe(1);
      if (season === 2077) {
        const team = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId: league.id, managerId: owner.id } });
        const pick = await db.draftPick.findFirstOrThrow({ where: { draftId: plan.draftId!, teamId: team.id, round: 1 }, include: { player: true } });
        await page.goto(`/leagues/${league.id}/team?sport=NFL`); await page.getByRole("button", { name: `Keep ${pick.player.displayName}`, exact: true }).click();
        await expect(page.getByText(/Selected keepers for the next snake draft/)).toContainText(pick.player.displayName);
        await page.goto(`/leagues/${league.id}/settings?sport=NFL`);
        await page.getByLabel("Next season start year").fill("2078"); await page.getByRole("button", { name: "Transition season", exact: true }).click();
        await expect.poll(() => db.leagueSport.findUniqueOrThrow({ where: { id: nfl.id }, include: { season: true } }).then(({ season }) => season.startYear)).toBe(2078);
        expect(await db.leagueSport.findUniqueOrThrow({ where: { id: nbaBefore.id } })).toEqual(nbaBefore);
        const active = await db.rosterEntry.findMany({ where: { leagueId: league.id, sport: "NFL", releasedAt: null } });
        expect(active).toHaveLength(1); expect(active[0].playerId).toBe(pick.playerId);
      } else {
        const retained = await db.keeperSelection.findFirstOrThrow({ where: { leagueSportId: nfl.id, retainedAt: { not: null } } });
        expect(retained.draftCost).toBe(1);
        expect((await db.draftPick.findMany({ where: { draftId: plan.draftId!, teamId: retained.teamId } })).map(({ round }) => round)).toEqual([2]);
        expect(await db.rosterEntry.count({ where: { leagueId: league.id, sport: "NFL", releasedAt: null } })).toBe(4);
        expect(await db.relativeMatchupPeriod.count({ where: { leagueSportId: nfl.id } })).toBe(28);
        await page.getByRole("link", { name: "Draft Results", exact: true }).click(); await page.screenshot({ path: test.info().outputPath("keeper-draft-results.png"), fullPage: true });
      }
    }
  } finally { await db.league.delete({ where: { id: league.id } }); await db.player.deleteMany({ where: { id: { in: extras.map(({ id }) => id) } } }); }
});
