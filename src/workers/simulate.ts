import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Sport } from "@/generated/prisma/enums";
import { configSchema } from "@/simulation/config";
import { simulateSeason } from "@/simulation/engine";
import { historicalSeasons } from "@/simulation/historical";
import { readSimulationSnapshot } from "@/simulation/snapshot";

const optionalInteger = z.coerce.number().int().optional();
const argsSchema = z.object({
  sport: z.enum(Sport).optional(),
  csv: z.string().optional(),
  "nfl-schedule": z.string().optional(),
  snapshot: z.string().optional(),
  output: z.string().optional(),
  "include-unverified": z.boolean().default(false),
  "include-partial": z.boolean().default(false),
  "include-quarantined": z.boolean().default(false),
  trace: z.boolean().default(false),
  year: z.array(z.coerce.number().int().min(1900).max(2100)).default([]),
  seed: z.array(z.coerce.number().int().min(0).max(0xffffffff)).default([11]),
  teams: optionalInteger,
  bench: optionalInteger,
  faab: optionalInteger,
  "waiver-weekday": optionalInteger,
  "waiver-hour-utc": optionalInteger,
  strategy: z.enum(["balanced", "upside", "scarcity"]).optional(),
  slots: z.string().transform((value) => value.split(",")).optional(),
}).refine(({ csv, snapshot }) => Boolean(csv) !== Boolean(snapshot), "Provide either --snapshot or --csv.")
  .refine(({ csv, sport }) => !csv || sport !== undefined, "--csv requires --sport.");

function gitState() {
  try {
    const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { commit: git(["rev-parse", "HEAD"]), uncommittedChanges: Boolean(git(["status", "--porcelain", "--untracked-files=no"])) };
  } catch {
    return { commit: null, uncommittedChanges: null };
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    sport: { type: "string" }, csv: { type: "string" }, "nfl-schedule": { type: "string" },
    snapshot: { type: "string" }, output: { type: "string" },
    "include-unverified": { type: "boolean" }, "include-partial": { type: "boolean" },
    "include-quarantined": { type: "boolean" }, trace: { type: "boolean" },
    year: { type: "string", multiple: true }, seed: { type: "string", multiple: true },
    teams: { type: "string" }, bench: { type: "string" }, slots: { type: "string" },
    faab: { type: "string" }, "waiver-weekday": { type: "string" }, "waiver-hour-utc": { type: "string" },
    strategy: { type: "string" },
  } });
  const args = argsSchema.parse(values);
  const fromCsv = args.csv && args.sport ? await historicalSeasons({
    csv: args.csv, sport: args.sport, nflSchedule: args["nfl-schedule"],
  }) : undefined;
  const inputs = fromCsv?.inputs ?? (args.snapshot ? [await readSimulationSnapshot(args.snapshot)] : []);
  if (args.sport && inputs.some(({ sport }) => sport !== args.sport)) throw new Error("Snapshot sport and --sport differ.");
  const included = inputs.filter(({ year, coverage, fixtures }) =>
    fixtures.length && (!args.year.length || args.year.includes(year)) && (
      coverage === "COMPLETE" ||
      (coverage === "UNVERIFIED" && (args.csv || args["include-unverified"])) ||
      (coverage === "PARTIAL" && args["include-partial"]) ||
      (coverage === "QUARANTINED" && args["include-quarantined"])
    ));
  if (!included.length) throw new Error("No requested seasons have eligible fixtures for these coverage options.");
  const configs = [...new Set(args.seed)].map((seed) => configSchema.parse({
    sport: included[0].sport, seed, teams: args.teams, bench: args.bench, strategy: args.strategy,
    faab: args.faab, slots: args.slots, includeTrace: args.trace,
    waiverWeekday: args["waiver-weekday"], waiverHourUtc: args["waiver-hour-utc"],
  }));
  const runs = included.flatMap((input) => configs.map((config) => simulateSeason(input, config)));
  const result = {
    code: gitState(),
    sourceCoverage: fromCsv && {
      ...fromCsv.summary, duplicateRows: fromCsv.duplicateRows, excludedPhaseRows: fromCsv.excludedPhaseRows,
      rowsOutsideFantasyPositions: fromCsv.nonFantasyRows,
      quarantinedRows: fromCsv.quarantinedRows,
    },
    skippedSeasons: inputs.filter((input) => !included.includes(input)).map(({ year, label, coverage, fixtures }) =>
      ({ year, label, coverage, fixtures: fixtures.length })),
    runs,
  };
  const report = JSON.stringify({ ...result, replayHash: createHash("sha256").update(JSON.stringify(runs)).digest("hex") });
  if (args.output) {
    await writeFile(args.output, report + "\n", { flag: "wx" });
    console.info(`Wrote ${runs.length} simulation runs to ${args.output}.`);
  } else {
    console.info(report);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Historical simulation failed.");
  process.exitCode = 1;
});
