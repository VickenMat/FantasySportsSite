import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";

// This deployment is tied to the user's explicit 22 -> 26 approval and exact reviewed SQL.
const reviewed = new Map([
  ["20261125210000_draft_center", "1b22081ffa11a4426b883ce788a40a7fdcbe49cd5b76269f210c44237f7c11c6"],
  ["20261125220000_salary_auction_accounts", "2e611a96a482ba3b4b8462c4dd17f86ff4a5af708a25362745aa516131ee5901"],
  ["20261125230000_revisioned_trades", "f29a5915c2964baf7510a0eb8758ed1bec2ae921e7da2a8b3c38fee18fec9c31"],
  ["20261125233000_independent_lifecycle", "6ef947872ce118820d15ccd6134472cfe90e869e690a6b6554a2779f5cc7a0e6"],
]);
if (process.env.APPROVED_M4_DEPLOYMENT !== "22_TO_26") throw new Error("Explicit approved deployment invocation is required.");
const target = new URL(process.env.DATABASE_URL);
if (target.pathname !== "/fantasy_evolution" || !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Expected the existing local development database.");
for (const [name, checksum] of reviewed) if (createHash("sha256").update(await readFile(`prisma/migrations/${name}/migration.sql`)).digest("hex") !== checksum) throw new Error(`Reviewed SQL changed: ${name}`);
const client = new pg.Client({ connectionString: target.href });
await client.connect();
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
try {
  await client.query("SET default_transaction_read_only=on");
  const before = [];
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename")).rows;
  const appliedBefore = (await client.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")).rows[0].n;
  if (appliedBefore !== 22) throw new Error(`Expected 22 applied migrations; found ${appliedBefore}.`);
  const appliedNames = new Set((await client.query("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")).rows.map(({ migration_name }) => migration_name));
  const pendingNames = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory() && !appliedNames.has(entry.name)).map(({ name }) => name).sort();
  if (JSON.stringify(pendingNames) !== JSON.stringify([...reviewed.keys()].sort())) throw new Error("Pending migrations differ from the four explicitly approved names.");
  for (const { tablename: table } of tables) {
    const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(({ column_name }) => column_name);
    const order = columns.includes("id") ? "id" : "to_jsonb(t)::text";
    const data = (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5(to_jsonb(t)::text),' ' ORDER BY ${order}),'')) AS fingerprint FROM ${quote(table)} t`)).rows[0];
    before.push({ table, columns, ...data });
  }
  await writeFile("/private/tmp/fantasy-m4-26-before.json", JSON.stringify({ appliedBefore, tables: before }, null, 2));
  const deployment = spawnSync("npm", ["run", "db:deploy"], { env: process.env, stdio: "inherit" });
  if (deployment.status !== 0) throw new Error("Approved migration deployment failed; retain the private backup and inspect Prisma status before further actions.");
  const appliedAfter = (await client.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")).rows[0].n;
  if (appliedAfter !== 26) throw new Error(`Expected 26 applied migrations after deployment; found ${appliedAfter}.`);
  for (const original of before) {
    const object = "jsonb_build_object(" + original.columns.flatMap((column) => ["'" + column.replaceAll("'", "''") + "'", `t.${quote(column)}`]).join(",") + ")";
    const order = original.columns.includes("id") ? "id" : `(${object})::text`;
    const after = (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5((${object})::text),' ' ORDER BY ${order}),'')) AS fingerprint FROM ${quote(original.table)} t`)).rows[0];
    if (after.count !== original.count || after.fingerprint !== original.fingerprint) throw new Error(`Original data changed during deployment: ${original.table}`);
  }
  const appendOnly = (await client.query("SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%append_only%' AND NOT t.tgisinternal AND t.tgenabled<>'D'")).rows[0].n;
  await writeFile("/private/tmp/fantasy-m4-26-deployment.json", JSON.stringify({ appliedBefore, appliedAfter, preservedTables: before.length, enabledAppendOnlyTriggers: appendOnly, reviewed: Object.fromEntries(reviewed), tables: before }, null, 2));
  console.log(`Approved migration deployment verified: ${appliedBefore} -> ${appliedAfter}; all ${before.length} original table fingerprints preserved; ${appendOnly} append-only triggers enabled.`);
} finally { await client.end(); }
