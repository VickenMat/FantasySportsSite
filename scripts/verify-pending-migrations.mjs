import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { authorizedTestEnvironment } from "./test-environment.mjs";

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const sourceUrl = new URL(process.env.DATABASE_URL);
if (sourceUrl.pathname !== "/fantasy_evolution") throw new Error("Expected the preserved development database as the read-only source.");
const environment = authorizedTestEnvironment(process.env);
const targetUrl = new URL(environment.DATABASE_URL);
if (targetUrl.pathname !== "/fantasy_evolution_test") throw new Error("Migration verification may write only to the authorized disposable test database.");
const schema = `integration_migration_${randomUUID().replaceAll("-", "")}`;
const source = new pg.Client({ connectionString: sourceUrl.href });
const target = new pg.Client({ connectionString: targetUrl.href });
const report = { schema, sourceDatabase: "fantasy_evolution", targetDatabase: "fantasy_evolution_test", baselineMigrations: 0, appliedPending: [], tables: [], foreignKeyViolations: [], drift: null };
await source.connect(); await target.connect();
try {
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const applied = (await source.query('SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows.map((row) => row.migration_name);
  report.baselineMigrations = applied.length;
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
  if (applied.some((name, i) => name !== migrations[i])) throw new Error("The development migration baseline is not a prefix of the repository migration history.");
  await target.query(`CREATE SCHEMA ${quote(schema)}`);
  await target.query(`SET search_path TO ${quote(schema)}`);
  for (const migration of applied) await target.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  const tables = (await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename")).rows.map(({ tablename }) => tablename);
  await target.query("BEGIN");
  // Trigger suppression is confined to the disposable target copy, followed by explicit FK validation.
  await target.query("SET LOCAL session_replication_role = replica");
  for (const table of tables) {
    const columns = (await source.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(({ column_name }) => column_name);
    const projection = `to_jsonb(t)`;
    const ordering = columns.includes("id") ? "id" : `(${projection})::text`;
    const fingerprint = `SELECT count(*)::text AS count, md5(coalesce(string_agg(md5((${projection})::text), ' ' ORDER BY ${ordering}),'')) AS fingerprint FROM ${quote(table)} t`;
    const baseline = (await source.query(fingerprint)).rows[0];
    await source.query(`DECLARE migration_copy NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM public.${quote(table)} t`);
    for (;;) {
      const batch = (await source.query("FETCH FORWARD 500 FROM migration_copy")).rows;
      if (!batch.length) break;
      await target.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) SELECT ${columns.map(quote).join(",")} FROM json_populate_recordset(NULL::${quote(table)},$1::json)`, ["[" + batch.map(({ row }) => row).join(",") + "]"]);
    }
    await source.query("CLOSE migration_copy");
    const copied = (await target.query(fingerprint)).rows[0];
    if (JSON.stringify(copied) !== JSON.stringify(baseline)) throw new Error(`Copy fingerprint mismatch: ${table}`);
    report.tables.push({ table, ...baseline, columns });
    process.stdout.write(`Copied and verified ${table}: ${baseline.count}\n`);
  }
  await target.query("COMMIT");
  await source.query("COMMIT");
  for (const migration of migrations.slice(applied.length)) {
    await target.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    report.appliedPending.push(migration);
  }
  for (const row of report.tables) {
    const object = "jsonb_build_object(" + row.columns.flatMap((column) => ["'" + column.replaceAll("'", "''") + "'", `t.${quote(column)}`]).join(",") + ")";
    const ordering = row.columns.includes("id") ? "id" : `(${object})::text`;
    const result = (await target.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5((${object})::text),' ' ORDER BY ${ordering}),'')) AS fingerprint FROM ${quote(row.table)} t`)).rows[0];
    if (result.count !== row.count || result.fingerprint !== row.fingerprint) throw new Error(`Pending migrations changed original data: ${row.table}`);
  }
  const foreignKeys = (await target.query(`SELECT c.conname, c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
    array_agg(a.attname::text ORDER BY k.ordinality) AS cols, array_agg(b.attname::text ORDER BY k.ordinality) AS refs
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(a,b,ordinality) ON true
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.a JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.b
    WHERE c.contype='f' AND n.nspname=$1 GROUP BY c.oid`, [schema])).rows;
  for (const fk of foreignKeys) {
    const nonnull = fk.cols.map((column) => `child.${quote(column)} IS NOT NULL`).join(" AND ");
    const equals = fk.cols.map((column, i) => `child.${quote(column)}=parent.${quote(fk.refs[i])}`).join(" AND ");
    const count = (await target.query(`SELECT count(*)::int AS n FROM ${fk.child} child WHERE ${nonnull} AND NOT EXISTS(SELECT 1 FROM ${fk.parent} parent WHERE ${equals})`)).rows[0].n;
    if (count) report.foreignKeyViolations.push({ name: fk.conname, count });
  }
  if (report.foreignKeyViolations.length) throw new Error("Populated-copy foreign key validation failed.");
  targetUrl.searchParams.set("schema", schema);
  // Prisma qualifies model queries; raw SQL also needs the disposable schema.
  // Match the integration runner instead of falling back to the public schema.
  const options = targetUrl.searchParams.get("options");
  targetUrl.searchParams.set("options", [options, `-c search_path=${schema}`].filter(Boolean).join(" "));
  const drift = spawnSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--config", "prisma7.config.ts", "--script"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8" });
  if (drift.status !== 0) throw new Error(drift.stderr);
  report.drift = drift.stdout;
  report.foreignKeysChecked = foreignKeys.length;
  report.preservedTables = report.tables.length;
  await writeFile("/private/tmp/fantasy-pending-migration-verification.json", JSON.stringify(report, null, 2));
  if (/^\s*(ALTER|CREATE|DROP)\b/m.test(report.drift)) throw new Error("Prisma schema drift detected; inspect the verification report before deployment.");
  if (process.argv.includes("--verify-recovered-backfill")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-recovered-backfill.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8" });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Recovered enrichment validation failed in disposable schema.");
  }
  if (process.argv.includes("--verify-accelerated-batch")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-accelerated-batch.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Accelerated batch validation failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-mlb-position-continuation")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-mlb-position-continuation.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "MLB historical position continuation failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-operational-promotion")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-operational-promotion.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Operational snapshot/competitive promotion validation failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-supplemental-source-promotion")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-supplemental-source-promotion.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Actual supplemental NHL/MLB source validation failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-direct-identity-discovery")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-current-direct-discovery.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Exact NBA6/NHL4 identity-only validation failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-four-sport-history")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-four-sport-history.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Four-sport historical acceptance failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-real-sources")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-real-sources.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Real-source validation failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-real-mlb-roles")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-mlb-role-selection.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Real MLB role validation failed in disposable schema.");
  }
  if (process.argv.includes("--verify-real-competitive-stages")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-real-competitive-stages.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Real-source controlled competitive acceptance failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-real-competitive-website")) {
    if(!process.argv.includes("--verify-real-competitive-stages"))throw Error("Competitive website acceptance requires the controlled real-source setup in the same disposable copy.");
    const validation = spawnSync("npx", ["playwright", "test", "tests/e2e/real-source-competition.spec.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href, REAL_COMPETITIVE_ACCEPTANCE: "true" }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Real-source competitive browser acceptance failed in disposable schema.");
  }
  if (process.argv.includes("--verify-real-mlb-stage")) {
    const validation = spawnSync(process.execPath, ["--import", "tsx", "src/workers/validate-real-mlb-stage.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Actual MLB source plus controlled competitive acceptance failed in disposable populated schema.");
  }
  if (process.argv.includes("--verify-real-mlb-website")) {
    if(!process.argv.includes("--verify-real-mlb-stage"))throw Error("MLB website acceptance requires the controlled real-source MLB setup in the same disposable copy.");
    const validation = spawnSync("npx", ["playwright", "test", "tests/e2e/real-source-competition.spec.ts", "--grep", "MLB supplemental"], { env: { ...environment, DATABASE_URL: targetUrl.href, REAL_MLB_COMPETITIVE_ACCEPTANCE: "true" }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Real-source MLB competitive browser acceptance failed in disposable schema.");
  }
  if (process.argv.includes("--verify-real-website")) {
    const validation = spawnSync("npx", ["playwright", "test", "tests/e2e/real-source-population.spec.ts"], { env: { ...environment, DATABASE_URL: targetUrl.href, REAL_SOURCE_POPULATION_ACCEPTANCE: "true" }, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(validation.stdout);
    if (validation.status !== 0) throw new Error(validation.stderr || "Real-population browser acceptance failed in disposable schema.");
  }
  process.stdout.write(`Verified ${report.preservedTables} populated tables and ${foreignKeys.length} foreign keys. Report: /private/tmp/fantasy-pending-migration-verification.json\n${report.drift}\n`);
} finally {
  await source.query("ROLLBACK").catch(() => {});
  await target.query("ROLLBACK").catch(() => {});
  await target.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
  await source.end(); await target.end();
}
