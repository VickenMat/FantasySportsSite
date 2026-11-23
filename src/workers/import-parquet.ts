import { parseArgs } from "node:util";
import { z } from "zod";
import { Sport } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { importHistoricalParquet } from "@/parquet/persist";
import { validateHistoricalParquet } from "@/parquet/read";

const schema = z.object({
  sport: z.enum(Sport), file: z.string().min(1), "validate-only": z.boolean().default(false),
  "allow-rejected": z.boolean().default(false), "correction-reason": z.string().trim().min(1).max(500).optional(),
  "batch-size": z.coerce.number().int().min(100).max(100_000).default(25_000),
});

async function main() {
  const { values } = parseArgs({ options: {
    sport: { type: "string" }, file: { type: "string" }, "validate-only": { type: "boolean" },
    "allow-rejected": { type: "boolean" }, "correction-reason": { type: "string" }, "batch-size": { type: "string" },
  } });
  const args = schema.parse(values);
  if (args["validate-only"]) {
    const summary = await validateHistoricalParquet(args.file, args.sport, args["batch-size"]);
    console.info(JSON.stringify(summary, null, 2));
    if (summary.rejectedRows) process.exitCode = 2;
    return;
  }
  const database = getDatabase();
  try {
    console.info(JSON.stringify(await importHistoricalParquet({
      path: args.file, sport: args.sport, allowRejected: args["allow-rejected"],
      correctionReason: args["correction-reason"], batchSize: args["batch-size"],
    }), null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Parquet import failed.");
  process.exitCode = 1;
});
