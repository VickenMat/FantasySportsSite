import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.AUTH_URL ?? "http://localhost:3000";
const testPort = new URL(baseURL).port || (baseURL.startsWith("https:") ? "443" : "80");

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${testPort}`,
    env: { ...process.env, NODE_ENV: "production" },
    url: baseURL,
    reuseExistingServer: process.env.REUSE_EXISTING_SERVER === "true",
    timeout: 60_000,
  },
});
