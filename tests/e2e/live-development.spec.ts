import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";

test.skip(process.env.RUN_LIVE_DEVELOPMENT_QA !== "true", "Runs only against the explicitly authorized migrated development environment.");

const qaPassword = "qa-development-acceptance-12!";

async function createLeague(page: import("@playwright/test").Page, input: {
  name: string; teams: number; sports: string[]; format: "Redraft" | "Dynasty";
}) {
  await page.goto("/leagues/new");
  await expect(page.getByLabel("Historical replay league")).toHaveCount(0);
  await page.getByLabel("League name").fill(input.name);
  await page.getByLabel("Teams").fill(String(input.teams));
  await page.getByLabel("Format").selectOption({ label: input.format });
  await page.getByLabel("Competition").selectOption("HEAD_TO_HEAD");
  for (const sport of ["NFL", "NBA", "MLB", "NHL"]) {
    const checkbox = page.getByRole("checkbox", { name: sport, exact: true });
    if (input.sports.includes(sport)) await checkbox.check(); else await checkbox.uncheck();
  }
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { name: input.name, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test("migrated development website passes league creation, Waivers, existing-league and session acceptance", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `qa-live-${suffix}@example.test`;
  const nflName = `QA 01 NFL Redraft ${suffix}`;
  const dynastyName = `QA 02 Multi Dynasty ${suffix}`;

  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(`QA Manager ${suffix}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(qaPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/dashboard");

  const nflLeagueId = await createLeague(page, { name: nflName, teams: 2, sports: ["NFL"], format: "Redraft" });
  await page.goto(`/leagues/${nflLeagueId}/waivers?sport=NFL`);
  await expect(page.getByRole("heading", { name: "NFL waiver wire" })).toBeVisible();
  await expect(page.getByText(/available to bid/)).toBeVisible();

  await page.getByRole("link", { name: "Fantasy Evolution home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.email).toBe(email);

  await createLeague(page, { name: dynastyName, teams: 3, sports: ["NFL", "NBA"], format: "Dynasty" });
  const database = getDatabase();
  expect(await database.league.findUniqueOrThrow({ where: { id: nflLeagueId } })).toMatchObject({ maxTeams: 2, format: "REDRAFT", competitionType: "HEAD_TO_HEAD" });
  const dynasty = await database.league.findFirstOrThrow({ where: { name: dynastyName }, include: { sports: true } });
  expect(dynasty).toMatchObject({ maxTeams: 3, format: "DYNASTY" });
  expect(new Set(dynasty.sports.map(({ sport }) => sport))).toEqual(new Set(["NFL", "NBA"]));

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.DEMO_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /Founders Dynasty/ }).click();
  await expect(page.getByRole("heading", { name: "Founders Dynasty", level: 1 })).toBeVisible();
  const existingLeagueId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.goto(`/leagues/${existingLeagueId}/waivers?sport=NFL`);
  await expect(page.getByRole("heading", { name: "NFL waiver wire" })).toBeVisible();
});
