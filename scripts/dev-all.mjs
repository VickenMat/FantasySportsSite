import "dotenv/config";
import { spawn } from "node:child_process";
import readline from "node:readline";
import net from "node:net";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const lockDirectory = resolve(".dev-stack-lock");
try {
  await mkdir(lockDirectory);
  await writeFile(resolve(lockDirectory, "owner"), String(process.pid));
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const owner = Number(await readFile(resolve(lockDirectory, "owner"), "utf8").catch(() => "0"));
  let alive = true;
  try { if (!owner) throw new Error("missing"); process.kill(owner, 0); } catch (failure) { alive = failure.code === "EPERM"; }
  if (alive) {
    console.error(`Development stack already owns PID ${owner}. Stop that terminal with Ctrl+C before starting another stack.`);
    process.exit(1);
  }
  console.error("Stale .dev-stack-lock found. Verify no stack is running, then remove that lock directory and retry.");
  process.exit(1);
}

try {
  await new Promise((resolvePort, rejectPort) => {
    const probe = net.createServer();
    probe.once("error", rejectPort);
    probe.listen(3000, () => probe.close(resolvePort));
  });
} catch {
  await rm(lockDirectory, { recursive: true });
  console.error("Port 3000 is occupied. Stop your existing project server or inspect the port before retrying. No workers were started.");
  process.exit(1);
}

const children = new Set();
let stopping = false;
let tickTimer;

function start(label, command, args) {
  const environment=label==='professional-data'?{...process.env,OPEN_DATA_RELEASE_SYNC:process.env.OPEN_DATA_RELEASE_SYNC??'true'}:process.env;
  const child = spawn(command, args, { env: environment, stdio: ["ignore", "pipe", "pipe"], shell: false, detached: process.platform !== "win32" });
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
    if (label === "web" && stopping) return;
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
  for (const child of children) {
    try { if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); } catch {}
  }
  const deadline=Date.now()+10_000;
  void (async()=>{
    while(children.size&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    for(const child of children){try{if(process.platform!=="win32")process.kill(-child.pid,"SIGKILL");else child.kill("SIGKILL");}catch{}}
    await rm(lockDirectory,{recursive:true,force:true});process.exit(code);
  })();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
start("web", "npm", ["run", process.argv.includes("--turbopack") ? "dev:turbopack" : "dev", "--", "--port", "3000"]);
start("draft-timer", "npm", ["run", "fantasy:draft-timer"]);
start("professional-data", "npm", ["run", "data:worker"]);
gameplayTick();
tickTimer = setInterval(gameplayTick, 60_000);
process.stdout.write("[dev-all] Web, draft timer, permission-gated data scheduler, and idempotent gameplay processing started. Press Ctrl+C to stop all processes.\n");
