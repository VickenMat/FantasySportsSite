import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { Sport } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { auditParquet } from "@/parquet/audit";
import { calculateParquetBaseline } from "@/parquet/baseline";
import { parquetSources } from "@/parquet/config";

const options = z.object({
  datasets: z.string().min(1).default("Datasets"),
  output: z.string().min(1).default("reports/m2-5-data-quality.json"),
  batchSize: z.coerce.number().int().min(100).max(100_000).default(25_000),
  database: z.boolean().default(false),
});

function args(values: string[]) {
  const parsed: Record<string, unknown> = {};
  for (let i = 0; i < values.length; i++) {
    if (values[i] === "--datasets") parsed.datasets = values[++i];
    else if (values[i] === "--output") parsed.output = values[++i];
    else if (values[i] === "--batch-size") parsed.batchSize = values[++i];
    else if (values[i] === "--database") parsed.database = true;
    else throw new Error(`Unknown option ${values[i]}.`);
  }
  return options.parse(parsed);
}

async function main() {
  const config = args(process.argv.slice(2));
  const database = config.database ? getDatabase() : null;
  const reports = [];
  const baseline = [];
  for (const sport of Object.values(Sport)) {
    const postgresActiveStats = database ? await database.playerGameStat.count({ where: { player: { sport }, nextRevision: null } }) : null;
    const path = join(resolve(config.datasets), parquetSources[sport].filename);
    reports.push(await auditParquet({
      sport, path, batchSize: config.batchSize, postgresActiveStats,
    }));
    baseline.push(...await calculateParquetBaseline(path, sport, config.batchSize));
  }
  if (database) await database.$disconnect();
  const output = resolve(config.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    reportVersion: "m2-5-analysis-1", reports, v9Baseline: baseline,
    balanceAssessment: {
      metric: "(highest sport mean team points - lowest sport mean team points) / mean of four sport averages * 100",
      targetPercent: 0.5, spreadPercent: null, status: "INSUFFICIENT_VERIFIED_EVIDENCE",
      reason: "No season has independently timestamped pregame evidence for draft, lineup, and waiver decisions. Raw player-game scoring is reported, while fantasy-team means and held-out balance remain unevaluated.",
    },
    v10: {
      status: "FRAMEWORK_ONLY", activated: false,
      reason: "V9 fantasy-team baseline cannot be defensibly measured from these final-box-score files, so V10 optimization was not run or selected.",
    },
  }, null, 2)}\n`);
  console.info(JSON.stringify({ output, sports: reports.map(({ sport, totals, source }) => ({ sport, sha256: source.sha256, ...totals })) }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Parquet audit failed.");
  process.exitCode = 1;
});
