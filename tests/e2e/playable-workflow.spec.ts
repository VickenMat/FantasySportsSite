import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { readFile, writeFile } from "node:fs/promises";

const password = "workflow-manager-12!";
let clientIp = 150;
async function register(page: Page, email: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${clientIp++}` });
  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill("Workflow Manager");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/dashboard");
}

for (const format of ["REDRAFT", "DYNASTY"] as const) {
  test(`fresh ${format} workflow through joining, completed drafts, matchups, trade and waivers`, async ({ page, browser }) => {
    test.setTimeout(process.env.RUN_RESTART_ACCEPTANCE === "true" ? 120000 : 60000);
    const suffix = randomUUID();
    const name = `Full workflow ${suffix}`;
    const email = `workflow-${suffix}@example.test`;
    const partnerEmail = `partner-${suffix}@example.test`;
    const sports = format === "REDRAFT" ? ["NFL"] : ["NFL", "NBA", "MLB", "NHL"];
    const database = getDatabase();
    const partnerContext = await browser.newContext({ baseURL: process.env.AUTH_URL });
    const partner = await partnerContext.newPage();
    try {
      await register(page, email);
      await page.goto("/leagues/new");
      await page.getByLabel("League name").fill(name);
      await page.getByLabel("Teams").fill("2");
      await page.getByLabel("Format").selectOption(format);
      await page.getByLabel("Visibility").selectOption("PUBLIC");
      for (const sport of ["NFL", "NBA", "MLB", "NHL"]) {
        await page.getByRole("checkbox", { name: sport, exact: true }).setChecked(sports.includes(sport));
      }
      await page.getByRole("button", { name: "Create league" }).click();
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      const leagueId = new URL(page.url()).pathname.split("/").at(-1)!;
      await register(partner, partnerEmail);
      await partner.goto("/leagues/discover");
      await partner.locator(".league-entry").filter({ hasText: name }).getByRole("button", { name: "Join league" }).click();
      await expect(partner.getByRole("heading", { name, exact: true })).toBeVisible();
      for (const sport of sports) {
        await page.goto(`/leagues/${leagueId}/settings?sport=${sport}`);
        await page.getByLabel("Draft rounds", { exact: true }).fill("1");
        await page.getByRole("button", { name: "Save settings" }).click();
        await page.getByRole("link", { name: "Open draft center" }).click();
        await page.getByRole("button", { name: `Start ${sport} snake draft` }).click();
        await page.getByRole("button", { name: "Auto-pick current team" }).click();
        await page.getByRole("button", { name: "Auto-pick current team" }).click();
        await expect.poll(() => database.draft.count({ where: { leagueId, sport: sport as "NFL", status: "COMPLETE" } })).toBe(1);
      }
      expect(await database.rosterEntry.count({ where: { leagueId, releasedAt: null } })).toBe(2 * sports.length);
      expect(await database.relativeMatchupPeriod.count({ where: { leagueId } })).toBe(14 * sports.length);
      await page.goto(`/leagues/${leagueId}/matchups?sport=NFL`);
      await expect(page.getByRole("heading", { name: /matchups/i, level: 1 })).toBeVisible();
      const user = await database.user.findUniqueOrThrow({ where: { email } });
      const mine = await database.fantasyTeam.findFirstOrThrow({ where: { leagueId, managerId: user.id } });
      const offered = await database.rosterEntry.findFirstOrThrow({ where: { leagueId, teamId: mine.id, sport: "NFL", releasedAt: null } });
      const requested = await database.rosterEntry.findFirstOrThrow({ where: { leagueId, teamId: { not: mine.id }, sport: format === "DYNASTY" ? "NBA" : "NFL", releasedAt: null } });
      await page.goto(`/leagues/${leagueId}/trades`);
      await page.locator(`input[name="offerPlayerIds"][value="${offered.playerId}"]`).check();
      await page.locator(`input[name="requestPlayerIds"][value="${requested.playerId}"]`).check();
      await page.getByRole("button", { name: "Send atomic proposal" }).click();
      await expect.poll(() => database.trade.count({ where: { leagueId, status: "PENDING" } })).toBe(1);
      await partner.goto(`/leagues/${leagueId}/trades`);
      await partner.getByRole("button", { name: "Accept trade", exact: true }).click();
      await expect(partner.locator(".trade-list .tag")).toHaveText("ACCEPTED");
      await page.goto(`/leagues/${leagueId}/team?sport=${requested.sport}`);
      await page.reload();
      expect(await database.rosterEntry.findFirst({ where: { leagueId, playerId: requested.playerId, teamId: mine.id, releasedAt: null } })).not.toBeNull();
      const drop = await page.request.post(`/api/leagues/${leagueId}/gameplay`, { data: { action: "drop", sport: requested.sport, playerId: requested.playerId } });
      expect(drop.status()).toBe(200);
      const claim = await page.request.post(`/api/leagues/${leagueId}/gameplay`, { data: { action: "waiver", sport: requested.sport, addPlayerId: requested.playerId, bid: 0 } });
      expect(claim.status()).toBe(200);
      await page.goto(`/leagues/${leagueId}/waivers?sport=${requested.sport}`);
      await expect(page.getByRole("heading", { name: `${requested.sport} waiver wire` })).toBeVisible();
      if (process.env.RUN_RESTART_ACCEPTANCE === "true") {
        const control = process.env.FANTASY_ACCEPTANCE_CONTROL!;
        const before = JSON.parse(await readFile(`${control}.status`, "utf8"));
        await writeFile(control, String(before.generation + 1));
        await expect.poll(async () => JSON.parse(await readFile(`${control}.status`, "utf8")).generation, { timeout: 30000 }).toBe(before.generation + 1);
        const after = JSON.parse(await readFile(`${control}.status`, "utf8"));
        expect(after.pids.every((pid: number) => !before.pids.includes(pid))).toBe(true);
        await expect.poll(async () => page.request.get("/api/auth/get-session").then((response) => response.json()).then((session) => session?.user?.email).catch(() => null), { timeout: 30000 }).toBe(email);
        expect((await (await partner.request.get("/api/auth/get-session")).json()).user.email).toBe(partnerEmail);
        await page.reload();
        await expect(page.getByRole("button", { name: "Cancel claim" })).toBeVisible();
        expect(await database.waiverClaim.count({ where: { leagueId, status: "PENDING" } })).toBe(1);
        expect(await database.draft.count({ where: { leagueId, status: "COMPLETE" } })).toBe(sports.length);
        expect(await database.trade.count({ where: { leagueId, status: "ACCEPTED" } })).toBe(1);
      }
      await page.getByRole("button", { name: "Cancel claim" }).click();
      await expect.poll(() => database.waiverClaim.count({ where: { leagueId, status: "CANCELLED" } })).toBe(1);
    } finally {
      await partnerContext.close().catch(() => {});
      await database.league.deleteMany({ where: { name } });
      await database.user.deleteMany({ where: { email: { in: [email, partnerEmail] } } });
    }
  });
}
