import "dotenv/config";
import { spawnSync } from "node:child_process";
import { authorizedTestEnvironment } from "./test-environment.mjs";

function run(command, args, environment) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let environment;
try {
  environment = authorizedTestEnvironment(process.env);
} catch (error) {
  console.error(`Test environment rejected: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] === "--prepare") {
  console.log(`Preparing authorized disposable database ${new URL(environment.DATABASE_URL).pathname.slice(1)}.`);
  run("npx", ["prisma", "migrate", "deploy", "--config", "prisma7.config.ts"], environment);
  run("npx", ["tsx", "prisma/seed.ts"], environment);
} else {
  if (args[0] === "--") args.shift();
  if (!args.length) {
    console.error("Pass a command after --.");
    process.exit(2);
  }
  run(args[0], args.slice(1), environment);
}
