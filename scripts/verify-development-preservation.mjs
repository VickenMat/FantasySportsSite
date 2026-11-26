import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
const baseline = JSON.parse(await readFile("/private/tmp/fantasy-m4-26-deployment.json", "utf8"));
const target = new URL(process.env.DATABASE_URL);
if (target.pathname !== "/fantasy_evolution") throw new Error("Expected the preserved local development database.");
const client = new pg.Client({ connectionString: target.href });
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const differences = [];
  for (const original of baseline.tables) {
    const object = "jsonb_build_object(" + original.columns.flatMap((column) => ["'" + column.replaceAll("'", "''") + "'", `t.${quote(column)}`]).join(",") + ")";
    const order = original.columns.includes("id") ? "id" : `(${object})::text`;
    const current = (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5((${object})::text),' ' ORDER BY ${order}),'')) AS fingerprint FROM ${quote(original.table)} t`)).rows[0];
    if (current.count !== original.count || current.fingerprint !== original.fingerprint) differences.push({ table: original.table, beforeCount: original.count, afterCount: current.count, journalOnly: original.table === "BackgroundJobRun" });
  }
  await client.query("COMMIT");
  const report = await readFile("docs/SCHEDULE_INTEGRATION_REPORT.md", "utf8");
  const artifacts = [];
  for (const match of report.matchAll(/\| `([^`]+\.(?:parquet|json))` \| [^|]+ \| `([0-9a-f]{64})` \|/g)) {
    const digest = createHash("sha256").update(await readFile(`data/schedule_data/${match[1]}`)).digest("hex");
    artifacts.push({ file: match[1], sha256: digest, preserved: digest === match[2] });
  }
  const output = { baselineTables: baseline.tables.length, differences, artifacts };
  await writeFile("/private/tmp/fantasy-m4-development-preservation.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  if (differences.some(({ journalOnly }) => !journalOnly) || artifacts.length !== 5 || artifacts.some(({ preserved }) => !preserved)) process.exitCode = 1;
} finally { await client.end(); }
