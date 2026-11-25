import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

if (process.env.RUN_RESTART_ACCEPTANCE === "true") process.env.FANTASY_ACCEPTANCE_CONTROL ??= join(tmpdir(), `fantasy-acceptance-${randomUUID()}`);

const baseURL = process.env.AUTH_URL ?? "http://localhost:3000";
const testPort = new URL(baseURL).port || (baseURL.startsWith("https:") ? "443" : "80");

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    command: process.env.RUN_RESTART_ACCEPTANCE === "true" ? "node scripts/acceptance-stack.mjs" : `npm run start -- --hostname 127.0.0.1 --port ${testPort}`,
    env: { ...process.env, NODE_ENV: "production" },
    url: baseURL,
    reuseExistingServer: process.env.REUSE_EXISTING_SERVER === "true",
    timeout: 60_000,
  },
});
