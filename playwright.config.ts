import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.AUTH_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start -- --hostname 127.0.0.1" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
