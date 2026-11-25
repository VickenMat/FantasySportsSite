import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authorizedTestEnvironment } from "./test-environment.mjs";

function run(command, args, environment) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(new Error(`${command} exited with ${result.signal ?? result.status}.`), {
      exitCode: result.status ?? 1,
    });
  }
}

function prepare(environment) {
  run("npx", ["prisma", "migrate", "deploy", "--config", "prisma7.config.ts"], environment);
  run("npx", ["tsx", "prisma/seed.ts"], environment);
}

async function runInIsolatedSchema(args, environment) {
  const schema = `integration_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = new URL(environment.DATABASE_URL);
  databaseUrl.searchParams.set("schema", schema);
  const options = databaseUrl.searchParams.get("options");
  databaseUrl.searchParams.set("options", [options, `-c search_path=${schema}`].filter(Boolean).join(" "));
  const isolatedEnvironment = { ...environment, DATABASE_URL: databaseUrl.href };
  const client = new pg.Client({ connectionString: environment.DATABASE_URL, connectionTimeoutMillis: 3_000 });

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    try {
      prepare(isolatedEnvironment);
      run(args[0], args.slice(1), isolatedEnvironment);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  } finally {
    await client.end();
  }
}

try {
  const environment = authorizedTestEnvironment(process.env);
  const args = process.argv.slice(2);
  const operation = args[0];
  if (operation === "--prepare") {
    console.log(`Preparing authorized disposable database ${new URL(environment.DATABASE_URL).pathname.slice(1)}.`);
    prepare(environment);
  } else {
    if (operation === "--isolated-schema") args.shift();
    if (args[0] === "--") args.shift();
    if (!args.length) {
      throw Object.assign(new Error("Pass a command after --."), { exitCode: 2 });
    }
    if (operation === "--isolated-schema") await runInIsolatedSchema(args, environment);
    else run(args[0], args.slice(1), environment);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error?.exitCode ?? 1;
}
