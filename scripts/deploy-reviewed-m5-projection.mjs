import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";

const migration = "20261126020000_professional_projection_states";
const sqlHash = "e09f1b7f28812757adffe60e950c6544d08ae467806258459968c4fda30c55fa";
if (process.env.APPROVED_M5_PROJECTION !== sqlHash) throw Error("Explicit approval for the reviewed projection migration is required.");
const url = new URL(process.env.DATABASE_URL);
if (url.pathname !== "/fantasy_evolution" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.searchParams.has("schema")) throw Error("Expected preserved local public development database.");
const hash = value => createHash("sha256").update(value).digest("hex");
if (hash(await readFile(`prisma/migrations/${migration}/migration.sql`)) !== sqlHash) throw Error("Reviewed migration SQL changed.");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) throw Error(`${command} failed: ${result.stderr ?? "inspect deployment log"}`);
  return result;
};
const client = new pg.Client({ connectionString: url.href });
const quote = value => '"' + value.replaceAll('"', '""') + '"';
await client.connect();
try {
  await client.query("SET default_transaction_read_only=on");
  const applied = (await client.query("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name")).rows.map(r => r.migration_name);
  if (applied.length !== 27) throw Error("Expected exactly 27 migrations; do not repeat a completed deployment.");
  const pending = (await readdir("prisma/migrations", { withFileTypes: true })).filter(e => e.isDirectory() && !applied.includes(e.name)).map(e => e.name);
  if (JSON.stringify(pending) !== JSON.stringify([migration])) throw Error("Pending migrations differ from the single reviewed migration.");
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename")).rows.map(r => r.tablename);
  if (tables.length !== 89) throw Error("Development baseline changed; review before deployment.");
  const snapshot = async () => {
    const result = {};
    for (const table of tables) result[table] = (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM public.${quote(table)} t`)).rows[0];
    return result;
  };
  const before = await snapshot();
  await writeFile("/private/tmp/m5-projection-before.json", JSON.stringify(before, null, 2), { mode: 0o600 });
  const directory = "data/private_backups";
  run("git", ["check-ignore", `${directory}/check.dump`]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backup = `${directory}/fantasy_evolution_pre_projection_${new Date().toISOString().replaceAll(/[:.]/g, "-")}.dump`;
  const file = await open(backup, "wx", 0o600);
  try {
    run("docker", ["exec", "fantasysportssite-postgres-1", "pg_dump", "-U", process.env.POSTGRES_USER ?? "fantasy", "-d", "fantasy_evolution", "-Fc"], { stdio: ["ignore", file.fd, "pipe"] });
  } finally { await file.close(); }
  const bytes = await readFile(backup);
  for (const args of [["--list"], ["--file=/dev/null"]]) run("docker", ["exec", "-i", "fantasysportssite-postgres-1", "pg_restore", ...args], { input: bytes });
  const backupReport = { path: backup, bytes: bytes.length, sha256: hash(bytes), archiveListAndFullDecodeVerified: true };
  await writeFile("/private/tmp/m5-projection-backup.json", JSON.stringify(backupReport, null, 2), { mode: 0o600 });
  run("npm", ["run", "db:deploy"], { env: process.env, stdio: "inherit" });
  const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("Original application rows changed; retain backup and inspect before proceeding.");
  const appliedAfter = (await client.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")).rows[0].n;
  if (appliedAfter !== 28) throw Error("Expected 28 migrations after deployment.");
  const drift = run("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--config", "prisma7.config.ts", "--script"], { env: process.env, encoding: "utf8" }).stdout;
  if (/^\s*(ALTER|CREATE|DROP)\b/m.test(drift)) throw Error("Unexpected Prisma drift after migration.");
  const report = { migration, sqlHash, appliedMigrations: appliedAfter, originalTablesPreserved: tables.length, originalRowsUnchanged: true, backfillRows: 0, backup: backupReport, drift };
  await writeFile("/private/tmp/m5-projection-deployment.json", JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally { await client.end(); }
