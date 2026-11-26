import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { installDraftBoundaryFixtures } from "../helpers/professional-boundaries";
import { processScheduledDrafts } from "../../src/server/draft-plans";
import { settleAuction } from "../../src/server/auctions";
import { processAdvancedTrades } from "../../src/server/advanced-trades";

test.use({ timezoneId: "UTC" });
const password = "auction-workflow-12!";
async function register(page: Page, email: string, ip: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip }); await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill("Auction Workflow Manager");
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click(); await expect(page).toHaveURL("/dashboard");
}

for (const salary of [false, true]) test(`fresh ${salary ? "salary dynasty" : "traditional cumulative dynasty"} auction, mixed-asset trade and persistent accounting`, async ({ page, browser }) => {
  test.setTimeout(60000);
  const db = getDatabase(); const suffix = randomUUID(); const name = `Auction acceptance ${suffix}`;
  const email = `auction-owner-${suffix}@example.test`, partnerEmail = `auction-partner-${suffix}@example.test`;
  const other = await browser.newContext({ baseURL: process.env.AUTH_URL, timezoneId: "UTC" }); const partner = await other.newPage();
  try {
    await register(page, email, salary ? "198.51.100.232" : "198.51.100.230");
    await page.goto("/leagues/new"); await page.getByLabel("League name").fill(name); await page.getByLabel("Teams").fill("2");
    await page.getByRole("combobox", { name: "Format", exact: true }).selectOption("DYNASTY"); await page.getByRole("combobox", { name: "Competition", exact: true }).selectOption(salary ? "HEAD_TO_HEAD" : "CUMULATIVE");
    await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("PUBLIC");
    for (const sport of ["NBA", "MLB", "NHL"]) await page.getByRole("checkbox", { name: sport, exact: true }).uncheck();
    await page.getByRole("button", { name: "Create league", exact: true }).click(); await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    const leagueId = new URL(page.url()).pathname.split("/").at(-1)!;
    await register(partner, partnerEmail, salary ? "198.51.100.233" : "198.51.100.231");
    await partner.goto("/leagues/discover"); await partner.locator(".league-entry").filter({ hasText: name }).getByRole("button", { name: "Join league" }).click();
    await expect(partner.getByRole("heading", { name, exact: true })).toBeVisible();
    await installDraftBoundaryFixtures(leagueId);
    await page.goto(`/leagues/${leagueId}/finances`);
    await page.getByRole("combobox", { name: "Financial format", exact: true }).selectOption(salary ? "SALARY" : "TRADITIONAL");
    await page.getByLabel("Integer budget / cap").fill(salary ? "400" : "100");
    await page.getByRole("button", { name: "Configure auction finances" }).click();
    await expect.poll(() => db.leagueFinancePolicy.count({ where: { leagueId, salaryMode: salary } })).toBe(1);
    await page.goto(`/leagues/${leagueId}/draft`);
    await page.getByRole("combobox", { name: "Draft type", exact: true }).selectOption("AUCTION");
    await page.getByLabel("Draft rounds per franchise").fill("1"); await page.getByLabel("Draft timer (seconds)").fill("30");
    await page.getByLabel(/Draft date and time/).fill(new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16));
    await page.getByRole("button", { name: "Save Draft Order and Schedule" }).click();
    await expect(page.getByRole("status")).toContainText("saved for every league member");
    const plan = await db.draftPlan.findFirstOrThrow({ where: { leagueId } });
    await expect(page.getByRole("button", { name: "Nominate", exact: true }).first()).toBeDisabled();
    await processScheduledDrafts(plan.scheduledAt!); await page.reload();
    await page.getByRole("button", { name: "Nominate", exact: true }).first().click();
    await expect.poll(() => db.acquisitionAuction.count({ where: { draftId: plan.draftId, status: "OPEN" } })).toBe(1);
    const first = await db.acquisitionAuction.findFirstOrThrow({ where: { draftId: plan.draftId, status: "OPEN" } });
    await partner.goto(`/leagues/${leagueId}/draft`); await partner.getByLabel("My maximum bid", { exact: true }).fill("7");
    await partner.getByRole("button", { name: "Submit bid" }).click();
    await expect.poll(() => db.acquisitionBid.count({ where: { auctionId: first.id, maximum: 7 } })).toBe(1);
    const funded = await db.acquisitionAuction.findUniqueOrThrow({ where: { id: first.id } });
    expect((await settleAuction(first.id, funded.closesAt)).price).toBe(7);
    await page.reload(); await page.getByRole("button", { name: "Nominate", exact: true }).first().click();
    await expect.poll(() => db.acquisitionAuction.count({ where: { draftId: plan.draftId, status: "OPEN" } })).toBe(1);
    const second = await db.acquisitionAuction.findFirstOrThrow({ where: { draftId: plan.draftId, status: "OPEN" } });
    await settleAuction(second.id, second.closesAt); await page.reload();
    await expect(page.getByRole("link", { name: "Draft Results", exact: true })).toBeVisible();
    await expect(page.getByText("No picks remaining", { exact: true })).toBeVisible();
    const accounts = await db.financeAccount.findMany({ where: { leagueId } });
    expect(accounts.reduce((sum, account) => sum + account.payroll, 0)).toBe(8);
    expect(accounts.every(({ reserved }) => reserved === 0)).toBe(true);
    expect(await db.playerSalary.count({ where: { leagueId, active: true } })).toBe(salary ? 2 : 0);
    const ownerUser = await db.user.findUniqueOrThrow({ where: { email } });
    const ownerTeam = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId, managerId: ownerUser.id } });
    const partnerUser = await db.user.findUniqueOrThrow({ where: { email: partnerEmail } });
    const partnerTeam = await db.fantasyTeam.findFirstOrThrow({ where: { leagueId, managerId: partnerUser.id } });
    const requested = await db.player.findUniqueOrThrow({ where: { id: first.playerId } });
    const sport = await db.leagueSport.findFirstOrThrow({ where: { leagueId } });
    // Explicit isolated fantasy deadline; production source gaps remain pending.
    await db.leagueSportSeason.updateMany({ where: { leagueSportId: sport.id }, data: { tradeDeadlineAt: new Date(Date.now() + 30 * 86400000) } });
    await page.goto(`/leagues/${leagueId}/trades`);
    await page.getByLabel("Review period for future proposals (hours)").fill("0"); await page.getByRole("button", { name: "Save review policy" }).click();
    await expect.poll(() => db.tradeReviewPolicy.findUnique({ where: { leagueId } }).then((policy) => policy?.reviewHours)).toBe(0);
    await page.getByRole("combobox", { name: `Destination for NFL · ${requested.displayName}`, exact: true }).first().selectOption(ownerTeam.id);
    await page.getByRole("combobox", { name: "From", exact: true }).selectOption(ownerTeam.id); await page.getByRole("combobox", { name: "To", exact: true }).selectOption(partnerTeam.id);
    await page.getByLabel("Amount", { exact: true }).fill("7"); await page.getByRole("button", { name: salary ? "Add cap transfer" : "Add FAAB transfer", exact: true }).click();
    await page.getByRole("button", { name: "Propose multi-asset trade" }).click();
    await page.getByRole("button", { name: "Accept revision 1", exact: true }).click();
    await partner.goto(`/leagues/${leagueId}/trades`); await partner.getByRole("button", { name: "Accept revision 1", exact: true }).click();
    await expect.poll(() => db.tradeProposal.count({ where: { leagueId, status: "REVIEW" } })).toBe(1);
    await processAdvancedTrades();
    await expect.poll(() => db.tradeProposal.count({ where: { leagueId, status: "EXECUTED" } })).toBe(1);
    expect((await db.rosterEntry.findFirstOrThrow({ where: { leagueId, playerId: requested.id, releasedAt: null } })).teamId).toBe(ownerTeam.id);
    if (salary) {
      expect((await db.playerSalary.findUniqueOrThrow({ where: { leagueId_playerId: { leagueId, playerId: requested.id } } })).teamId).toBe(ownerTeam.id);
      const current = await db.financeAccount.findMany({ where: { leagueId, kind: "SALARY" } });
      expect(current.reduce((sum, account) => sum + account.capAdjustment, 0)).toBe(0);
      expect(current.reduce((sum, account) => sum + account.payroll, 0)).toBe(8);
    } else {
      const current = await db.faabAccount.findMany({ where: { leagueId } }); expect(current.reduce((sum, account) => sum + account.balance, 0)).toBe(200);
      await page.goto(`/leagues/${leagueId}/waivers`); await expect(page.getByText("93 FAAB available to bid", { exact: false })).toBeVisible();
    }
    await page.goto(`/leagues/${leagueId}/draft?view=board`);
    await expect(page.locator(".draft-board-scroll")).toContainText("$7");
    await page.screenshot({ path: test.info().outputPath(salary ? "salary-auction-results.png" : "cumulative-auction-results.png"), fullPage: true });
    if (!salary) expect(await db.matchup.count({ where: { leagueId } })).toBe(0);
  } finally {
    await other.close(); await db.league.deleteMany({ where: { name } }); await db.user.deleteMany({ where: { email: { in: [email, partnerEmail] } } });
  }
});
