import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { databaseName } from "./test-environment.mjs";

// Used only by opt-in isolated acceptance. Never discovers or kills external processes.
const control = process.env.FANTASY_ACCEPTANCE_CONTROL;
const url = new URL(process.env.DATABASE_URL);
if (process.env.RUN_RESTART_ACCEPTANCE !== "true" || !control || databaseName(url.href) !== "fantasy_evolution_test" ||
  !url.searchParams.get("schema")?.startsWith("integration_")) throw new Error("Restart acceptance requires its own authorized disposable schema and control file.");
const children = new Set(); let generation = 0; let stopping = false; let restarting = false; let tickTimer;
function start(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  children.add(child); child.once("exit", () => children.delete(child)); return child;
}
function tick() {
  if (![...children].some((child) => child.tick)) start(["--import", "tsx", "src/workers/process-fantasy.ts"]).tick = true;
}
async function launch() {
  const port = new URL(process.env.AUTH_URL).port || "3100";
  start(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port]);
  start(["--import", "tsx", "src/workers/draft-timer.ts"]);
  tick(); tickTimer = setInterval(tick, 60_000);
  await writeFile(`${control}.status`, JSON.stringify({ generation, pids: [...children].map(({ pid }) => pid) }));
}
async function stopChildren() {
  clearInterval(tickTimer);
  await Promise.all([...children].map((child) => new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    try { child.kill("SIGTERM"); } catch { clearTimeout(timer); resolve(); }
  })));
}
async function shutdown() {
  if (stopping) return; stopping = true; unwatchFile(control);
  await stopChildren(); await rm(control, { force: true }); await rm(`${control}.status`, { force: true }); process.exit(0);
}
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
await writeFile(control, "0"); await launch();
watchFile(control, { interval: 200 }, async () => {
  if (restarting || stopping) return;
  const request = Number(await readFile(control, "utf8").catch(() => "0"));
  if (!Number.isSafeInteger(request) || request <= generation) return;
  restarting = true;
  try { await stopChildren(); generation = request; if (!stopping) await launch(); }
  finally { restarting = false; }
});
