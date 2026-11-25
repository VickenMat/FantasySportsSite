import { randomUUID } from "node:crypto";
import { expect, request as apiRequest, test, type Page } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { createLeague } from "../../src/server/league";

const password = "manager-test-12!";
let testIp = 10;

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
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${testIp++}` });
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
  expect([200, 503]).toContain(health.status());
  const healthBody = await health.json();
  expect(healthBody).toMatchObject({ application: "available", database: "connected" });
  expect(healthBody).toHaveProperty("workers.draftTimer");
  expect(healthBody).toHaveProperty("workers.gameplayTick");
  const ledger = await page.request.get("/api/scoring/3712b6d3-9fb8-45a1-9717-7fb0a4946601/ledger");
  expect(ledger.status()).toBe(401);
  await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
  await expect(page).toHaveURL("/sign-in");
});

test("accepts both explicit local auth origins and rejects an untrusted origin", async () => {
  const database = getDatabase();
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("Seed an account with DEMO_EMAIL and DEMO_PASSWORD.");
  const configured = new URL(process.env.AUTH_URL ?? "http://localhost:3000");
  const port = configured.port ? `:${configured.port}` : "";
  const localOrigins = [`${configured.protocol}//localhost${port}`, `${configured.protocol}//127.0.0.1${port}`];
  const emails: string[] = [];

  try {
    for (const origin of localOrigins) {
      const email = `origin-${randomUUID()}@example.test`;
      emails.push(email);
      const registrationClient = await apiRequest.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin, "x-forwarded-for": "203.0.113.10" },
      });
      const registration = await registrationClient.post("/api/auth/sign-up/email", {
        data: { name: "Origin Test", email, password, callbackURL: "/dashboard" },
      });
      expect(registration.status()).toBe(200);
      await registrationClient.dispose();

      const signInClient = await apiRequest.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin, "x-forwarded-for": "203.0.113.11" },
      });
      const signIn = await signInClient.post("/api/auth/sign-in/email", {
        data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, callbackURL: "/dashboard" },
      });
      expect(signIn.status()).toBe(200);
      const session = await signInClient.get("/api/auth/get-session");
      expect((await session.json()).user.email).toBe(DEMO_EMAIL);
      await signInClient.dispose();
    }

    const rejectedEmail = `rejected-${randomUUID()}@example.test`;
    emails.push(rejectedEmail);
    const attacker = await apiRequest.newContext({
      baseURL: configured.origin,
      extraHTTPHeaders: { origin: "https://untrusted.example" },
    });
    const rejected = await attacker.post("/api/auth/sign-up/email", {
      data: { name: "Rejected Origin", email: rejectedEmail, password },
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
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(DEMO_EMAIL);
  await page.getByRole("link", { name: "Dashboard" }).click();

  await page.getByRole("link", { name: /Founders Dynasty/ }).click();
  await expect(page.getByRole("heading", { name: "Founders Dynasty", level: 1 })).toBeVisible();
  const leagueId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const ledger = await page.request.get("/api/scoring/3712b6d3-9fb8-45a1-9717-7fb0a4946601/ledger", { params: { leagueId } });
  expect(ledger.status()).toBe(200);
  expect(await ledger.json()).toEqual({ items: [], nextOffset: null });
  await page.getByRole("link", { name: "Fantasy Evolution home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.email).toBe(DEMO_EMAIL);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Demo Manager" })).toBeVisible();
  await page.goto(`/leagues/${leagueId}/scoring`);
  await expect(page.getByRole("row", { name: "NFL Passing Tds 16.0" })).toBeVisible();
  await page.goto(`/leagues/${leagueId}/waivers?sport=NFL`);
  await expect(page.getByRole("heading", { name: "NFL waiver wire" })).toBeVisible();

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

test("profile editing persists and explicit account deletion anonymizes identity and revokes sessions", async ({ page }) => {
  const email = `account-${randomUUID()}@example.test`;
  const database = getDatabase();
  await register(page, "Account Manager", email);
  const original = await database.user.findUniqueOrThrow({ where: { email } });
  await page.goto("/account");
  await page.getByLabel("Display name").fill("Updated Account Manager");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect.poll(async () => (await database.user.findUniqueOrThrow({ where: { id: original.id } })).name).toBe("Updated Account Manager");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Updated Account Manager");
  await page.getByLabel("Current password", { exact: true }).last().fill(password);
  await page.getByLabel("Type DELETE").fill("DELETE");
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(page).toHaveURL("/sign-in?deleted=1");
  const anonymized = await database.user.findUniqueOrThrow({ where: { id: original.id } });
  expect(anonymized.email).not.toBe(email);
  expect(anonymized.name).not.toBe("Updated Account Manager");
  expect(await database.session.count({ where: { userId: original.id } })).toBe(0);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
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
    const commissioner = await database.user.findUniqueOrThrow({ where: { email } });
    const previousAdmins = process.env.HISTORICAL_REPLAY_ADMIN_EMAILS;
    process.env.HISTORICAL_REPLAY_ADMIN_EMAILS = email;
    const league = await createLeague(commissioner.id, { name, sports: ["NBA"], maxTeams: 4, historical: true, seasonYear: 2026, fillWithComputers: true })
      .finally(() => { if (previousAdmins === undefined) delete process.env.HISTORICAL_REPLAY_ADMIN_EMAILS; else process.env.HISTORICAL_REPLAY_ADMIN_EMAILS = previousAdmins; });
    await page.goto(`/leagues/${league.id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const leagueId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByLabel("Draft seconds per pick").fill("30");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect.poll(() => database.commissionerAuditEvent.count({
      where: { leagueId, action: "UPDATE_GAMEPLAY_SETTINGS", sport: "NBA" },
    })).toBe(1);
    await page.getByRole("link", { name: "View audit history" }).click();
    await expect(page.getByRole("heading", { name: "Commissioner audit" })).toBeVisible();
    await page.getByText("View changes").click();
    await expect(page.getByText('{"draftSecondsPerPick":30}', { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("link", { name: "Open draft center" }).click();
    await page.getByRole("button", { name: "Start NBA snake draft" }).click();
    await expect(page.getByRole("heading", { name: "NBA draft" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Player Pool" })).toHaveClass(/active/);
    await expect(page.getByRole("heading", { name: "My Team" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Draft Queue" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("draft-room.png"), fullPage: true });
    await expect(page.getByRole("timer")).toContainText("0:30");
    await page.getByRole("button", { name: "Pause draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft paused");
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Draft paused");
    await page.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("button", { name: "Auto-pick current team" }).click();
    await page.getByRole("link", { name: "Draft Board" }).click();
    await expect(page.locator(".draft-order-list li.complete")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".draft-order-list li.complete")).toHaveCount(1);
    await page.getByRole("link", { name: "My Team", exact: true }).click();
    const movable = page.locator(".position-button:not([disabled])").first();
    await expect(movable).toBeVisible();
    await movable.click();
    await expect(page.locator(".position-button.legal").first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("roster-position-selection.png"), fullPage: true });
    await page.getByRole("button", { name: /to U-BENCH 3$/ }).click();
    await expect.poll(async () => database.rosterEntry.findFirst({
      where: { leagueId, sport: "NBA", slot: "UNIVERSAL_BENCH", slotIndex: 3, releasedAt: null }, select: { slotIndex: true },
    })).toEqual({ slotIndex: 3 });
    await page.getByRole("link", { name: "Scoring", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Universal Balanced Points V9" })).toBeVisible();
    await page.getByRole("link", { name: "Trades", exact: true }).click();
    await expect(page.getByRole("heading", { name: "League trades" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("cross-sport-trade-builder.png"), fullPage: true });
    await page.goto(`/leagues/${leagueId}/picks?sport=NBA`);
    await expect(page.getByRole("heading", { name: "NBA future draft picks" })).toBeVisible();
    await page.getByRole("button", { name: "Grant future picks" }).click();
    await expect(page.getByRole("status")).toContainText("Granted 48 future picks");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(49);
    await page.getByRole("button", { name: "Grant future picks" }).click();
    await expect(page.getByRole("status")).toContainText("already granted");
    await page.getByRole("link", { name: "My Team", exact: true }).click();
    await expect(page.getByRole("heading", { name: "NBA rookie draft picks" })).toBeVisible();
    await page.goto("/analysis");
    await expect(page.getByRole("heading", { name: "Evidence before conclusions" })).toBeVisible();
    await expect(page.getByText("INSUFFICIENT_VERIFIED_EVIDENCE")).toBeVisible();
    expect(leagueId).toMatch(/[0-9a-f-]{36}/);
  } finally {
    await database.league.deleteMany({ where: { name } });
    await database.user.deleteMany({ where: { email } });
  }
});

test("creates a playable two-team four-sport league with independent draft rooms", async ({ page }) => {
  const name = `Four Sport ${randomUUID()}`; const email = `four-${randomUUID()}@example.test`; const database = getDatabase();
  try {
    await register(page, "Four Sport Commissioner", email); await page.goto("/leagues/new");
    await page.getByLabel("League name").fill(name); await page.getByLabel("Teams").fill("2");
    await page.getByLabel("Expected draft completion").fill("2027-02-15T12:00");
    await page.getByRole("button", { name: "Preview championship schedule" }).click();
    const scheduleCards = page.locator(".schedule-preview .mini-card");
    await expect(scheduleCards).toHaveCount(4);
    for (const card of await scheduleCards.all()) await expect(card.getByText(/(AVAILABLE|PENDING_DATA|UNAVAILABLE)/)).toBeVisible();
    await page.getByText("Optional gameplay settings").click(); await page.getByLabel(/Fill vacant slots/).check();
    await page.getByRole("button", { name: "Create league" }).click(); await expect(page.getByRole("heading", { name })).toBeVisible();
    const leagueId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("link", { name: "Open draft center" }).click();
    for (const sport of ["NFL", "MLB", "NBA", "NHL"]) await expect(page.getByRole("link", { name: sport, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start NFL snake draft" }).click();
    await expect(page.getByRole("heading", { name: "NFL draft" })).toBeVisible();
    await page.getByRole("link", { name: "NBA", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start NBA snake draft" })).toBeVisible();
    await page.getByRole("link", { name: "Trades", exact: true }).click();
    for (const sport of ["NFL", "MLB", "NBA", "NHL"]) await expect(page.getByText(`${sport} roster`).first()).toBeVisible();
    await page.screenshot({ path: "reports/screenshots/m3-7-2-cross-sport-trade-builder.png", fullPage: true });
    expect(leagueId).toMatch(/[0-9a-f-]{36}/);
  } finally { await database.league.deleteMany({ where: { name } }); await database.user.deleteMany({ where: { email } }); }
});
