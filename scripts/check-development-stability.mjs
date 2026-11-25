import { chromium } from "@playwright/test";

const baseURL = process.env.AUTH_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("This smoke check supports the local development server only.");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ baseURL });
  const response = await context.request.post("/api/auth/sign-in/email", { headers: { origin: baseURL }, data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD } });
  if (!response.ok()) throw new Error("Development smoke sign-in failed.");
  const dashboard = await context.newPage(); await dashboard.goto("/dashboard");
  const league = await dashboard.getByRole("link", { name: /Founders Dynasty/ }).getAttribute("href");
  const pages = [];
  // Compile every observed route before counting idle navigations. Cold compilation
  // of another route can update shared chunks in an already open development page.
  for (const route of ["/", "/dashboard", league]) {
    const page = await context.newPage(); const response = await page.goto(route);
    if (response.status() !== 200) throw new Error(`Route unavailable: ${route}`);
    await page.waitForLoadState("networkidle"); pages.push({ page, route });
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const rows = pages.map(({ page, route }) => {
    const row = { route, navigations: 0, errors: [] };
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) row.navigations++; });
    page.on("pageerror", (error) => row.errors.push(error.message)); return row;
  });
  for (let elapsed = 30; elapsed <= 120; elapsed += 30) {
    await new Promise((resolve) => setTimeout(resolve, 30000)); console.log(JSON.stringify({ elapsed, rows }));
  }
  if (rows.some(({ navigations, errors }) => navigations || errors.length)) process.exitCode = 1;
} finally { await browser.close(); }
