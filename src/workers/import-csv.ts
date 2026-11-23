import { parseArgs } from "node:util";
import { z } from "zod";
import { Sport } from "@/generated/prisma/enums";
import { validateHistoricalCsv } from "@/imports/csv";
import { importHistoricalCsv } from "@/imports/persist";
import { getDatabase } from "@/lib/db";

const argsSchema = z.object({
  sport: z.enum(Sport),
  file: z.string().min(1),
  "validate-only": z.boolean().default(false),
  "allow-rejected": z.boolean().default(false),
  "correction-reason": z.string().trim().min(1).max(500).optional(),
});

async function main() {
  const { values } = parseArgs({
    options: {
      sport: { type: "string" }, file: { type: "string" }, "validate-only": { type: "boolean" },
      "allow-rejected": { type: "boolean" }, "correction-reason": { type: "string" },
    },
  });
  const args = argsSchema.parse(values);
  if (args["validate-only"]) {
    const summary = await validateHistoricalCsv(args.file, args.sport);
    console.info(JSON.stringify(summary, null, 2));
    if (summary.rejectedRows) process.exitCode = 2;
    return;
  }

  const database = getDatabase();
  try {
    const result = await importHistoricalCsv({
      sport: args.sport, path: args.file, correctionReason: args["correction-reason"], allowRejected: args["allow-rejected"],
    });
    console.info(JSON.stringify(result, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Historical import failed.");
  process.exitCode = 1;
});
