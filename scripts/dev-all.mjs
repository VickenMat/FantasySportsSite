import { spawn } from "node:child_process";
import readline from "node:readline";

const children = new Set();
let stopping = false;
let tickTimer;

function start(label, command, args) {
  const child = spawn(command, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"], shell: false });
  children.add(child);
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    const lines = readline.createInterface({ input: stream });
    lines.on("line", (line) => output.write(`[${label}] ${line}\n`));
  }
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping && label !== "gameplay-tick") {
      process.stderr.write(`[${label}] stopped unexpectedly (${signal ?? code}). Shutting down local stack.\n`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function gameplayTick() {
  if (stopping || [...children].some((child) => child.__gameplayTick)) return;
  const child = start("gameplay-tick", "npm", ["run", "fantasy:process"]);
  child.__gameplayTick = true;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  if (tickTimer) clearInterval(tickTimer);
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1_500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
start("web", "npm", ["run", "dev"]);
start("draft-timer", "npm", ["run", "fantasy:draft-timer"]);
gameplayTick();
tickTimer = setInterval(gameplayTick, 60_000);
process.stdout.write("[dev-all] Web, draft timer, and idempotent gameplay processing started. Press Ctrl+C to stop all processes.\n");
