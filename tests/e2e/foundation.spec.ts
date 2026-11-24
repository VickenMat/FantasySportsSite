import { randomUUID } from "node:crypto";
import { expect, request as apiRequest, test, type Page } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";

const password = "manager-test-12!";

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function register(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.afterAll(async () => getDatabase().$disconnect());
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `e2e-${randomUUID()}` });
});

test("public landing and database status work, and guests are redirected", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /four sports.*one league/i })).toBeVisible();
  await page.locator(".hero-media img").evaluate(async (image: HTMLImageElement) => {
    await image.decode();
  });
  await page.getByRole("link", { name: "Sports", exact: true }).click();
  await expect(page).toHaveURL(/#sports$/);
  await expect(page.getByRole("heading", { name: "Pick your playing field" })).toBeVisible();
  const health = await page.request.get("/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ status: "ok", database: "connected" });
  const ledger = await page.request.get("/api/scoring/3712b6d3-9fb8-45a1-9717-7fb0a4946601/ledger");
  expect(ledger.status()).toBe(401);
  await page.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page).toHaveURL("/sign-in");
});

test("accepts both explicit local auth origins and rejects an untrusted origin", async () => {
  const database = getDatabase();
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("Seed an account with DEMO_EMAIL and DEMO_PASSWORD.");
  const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const emails: string[] = [];

  try {
    for (const origin of localOrigins) {
      const email = `origin-${randomUUID()}@example.test`;
      emails.push(email);
      const registrationClient = await apiRequest.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin, "x-forwarded-for": `e2e-registration-${randomUUID()}` },
      });
      const registration = await registrationClient.post("/api/auth/sign-up/email", {
        data: { name: "Origin Test", email, password, callbackURL: "/dashboard" },
      });
      expect(registration.status()).toBe(200);
      await registrationClient.dispose();

      const signInClient = await apiRequest.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin, "x-forwarded-for": `e2e-sign-in-${randomUUID()}` },
      });
      const signIn = await signInClient.post("/api/auth/sign-in/email", {
        data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, callbackURL: "/dashboard" },
      });
      expect(signIn.status()).toBe(200);
      const session = await signInClient.get("/api/auth/get-session");
      expect((await session.json()).user.email).toBe(DEMO_EMAIL);
      await signInClient.dispose();
    }

    const attacker = await apiRequest.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { origin: "https://untrusted.example" },
    });
    const rejected = await attacker.post("/api/auth/sign-up/email", {
      data: { name: "Rejected Origin", email: `rejected-${randomUUID()}@example.test`, password },
    });
    expect(rejected.status()).toBe(403);
    expect(await rejected.json()).toMatchObject({ message: "Invalid origin" });
    await attacker.dispose();
  } finally {
    await database.user.deleteMany({ where: { email: { in: emails } } });
  }
});

test("demo sign-in shows a persisted league and preset; sign-out revokes the session", async ({ page }) => {
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("Seed an account with DEMO_EMAIL and DEMO_PASSWORD.");

  await page.goto("/sign-in");
  await signIn(page, DEMO_EMAIL, `${DEMO_PASSWORD}-wrong`);
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
  await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL("/dashboard");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome, Demo Manager" })).toBeVisible();
  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user.email).toBe(DEMO_EMAIL);
  const cookies = await page.context().cookies();
  expect(cookies.find(({ name }) => name.endsWith("session_token"))).toMatchObject({
    httpOnly: true, sameSite: "Lax",
  });

  await page.getByRole("link", { name: /Founders Dynasty/ }).click();
  await expect(page.getByRole("heading", { name: "Founders Dynasty", level: 1 })).toBeVisible();
  const leagueId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const ledger = await page.request.get("/api/scoring/3712b6d3-9fb8-45a1-9717-7fb0a4946601/ledger", { params: { leagueId } });
  expect(ledger.status()).toBe(200);
  expect(await ledger.json()).toEqual({ items: [], nextOffset: null });
  await expect(page.getByText("Experimental · Cross-sport balance is pending validation.")).toBeVisible();
  await page.getByText("NFL scoring weights").click();
  await expect(page.getByRole("row", { name: "passing_tds 16.0" })).toBeVisible();
  await expect(page.getByText("Lamar Jackson")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/sign-in");
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
});

test("a new account sees an empty dashboard and cannot view a different league", async ({ page }) => {
  const email = `new-${randomUUID()}@example.test`;
  const database = getDatabase();
  const league = await database.league.findUniqueOrThrow({ where: { slug: "founders-dynasty" } });

  try {
    await register(page, "New Manager", email);
    await expect(page.getByRole("heading", { name: "No leagues yet" })).toBeVisible();
    const response = await page.goto(`/leagues/${league.id}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
  } finally {
    await database.user.deleteMany({ where: { email } });
  }
});

test("password recovery delivers email, updates the password and revokes an existing session", async ({ page, request }) => {
  const email = `recovery-${randomUUID()}@example.test`;
  const newPassword = "updated-manager-password!";
  const inbox = "http://127.0.0.1:8025/api/v1";
  const database = getDatabase();
  const messageIds: string[] = [];

  try {
    await register(page, "Recovery Manager", email);
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText(/a reset link will arrive/);
    await expect.poll(async () => {
      const result = await request.get(`${inbox}/search`, { params: { query: `to:${email}` } });
      const { messages } = await result.json() as { messages: { ID: string }[] };
      messageIds.splice(0, messageIds.length, ...(messages ?? []).map(({ ID }) => ID));
      return messageIds.length;
    }).toBe(1);
    const message = await request.get(`${inbox}/message/${messageIds[0]}`);
    const { Text } = await message.json() as { Text: string };
    const resetURL = Text.match(/https?:\/\/\S+/)?.[0];
    expect(resetURL).toBeTruthy();
    await page.goto(resetURL!);
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL("/sign-in?reset=1");
    expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Welcome, Recovery Manager" })).toBeVisible();
  } finally {
    await database.user.deleteMany({ where: { email } });
    if (messageIds.length) await request.delete(`${inbox}/messages`, { data: { IDs: messageIds } });
  }
});

test("mobile layout fits the viewport and supports keyboard access to navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
});

test("creates a historical league and opens its persistent draft and analysis pages", async ({ page }) => {
  const name = `Replay ${randomUUID()}`;
  const email = `replay-${randomUUID()}@example.test`;
  const database = getDatabase();
  try {
    await register(page, "Replay Commissioner", email);
    await page.goto("/leagues/new");
    await page.getByLabel("League name").fill(name);
    await page.getByLabel("Sport").selectOption("NBA");
    await page.getByLabel("Teams").fill("4");
    await page.getByLabel("Historical replay league").check();
    await page.getByLabel("Fill empty seats with computer managers").check();
    await page.getByRole("button", { name: "Create league" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const leagueId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByLabel("Draft seconds per pick").fill("30");
    await page.getByRole("button", { name: "Save gameplay settings" }).click();
    await page.getByRole("link", { name: "Draft", exact: true }).click();
    await page.getByRole("button", { name: "Start snake draft" }).click();
    await expect(page.getByRole("heading", { name: `${name} draft` })).toBeVisible();
    await expect(page.getByRole("timer")).toContainText("0:30");
    await page.getByRole("button", { name: "Pause draft" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft paused");
    await page.reload();
    await expect(page.getByRole("status")).toHaveText("Draft paused");
    await page.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("button", { name: "Auto-pick current team" }).click();
    await expect(page.locator(".pick-list li")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".pick-list li")).toHaveCount(1);
    await page.getByRole("link", { name: "Scoring", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Universal Balanced Points V9" })).toBeVisible();
    await page.getByRole("link", { name: "Trades", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
    await page.goto("/analysis");
    await expect(page.getByRole("heading", { name: "Evidence before conclusions" })).toBeVisible();
    await expect(page.getByText("INSUFFICIENT_VERIFIED_EVIDENCE")).toBeVisible();
    expect(leagueId).toMatch(/[0-9a-f-]{36}/);
  } finally {
    await database.league.deleteMany({ where: { name } });
    await database.user.deleteMany({ where: { email } });
  }
});
