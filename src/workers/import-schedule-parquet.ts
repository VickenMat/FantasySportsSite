import { parseArgs } from "node:util";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { importScheduleBundle, scheduleBundleFiles, validateScheduleBundle } from "@/parquet/schedule-import";

const { values } = parseArgs({ options: { directory: { type: "string" }, "validate-only": { type: "boolean" } } });
const input = z.object({ directory: z.string().min(1).default("data/schedule_data"), "validate-only": z.boolean().default(false) }).parse(values);
try {
  const files = scheduleBundleFiles(input.directory);
  if (input["validate-only"]) {
    const value = await validateScheduleBundle(files);
    console.info(JSON.stringify({ scheduleRows: value.schedules.count, calendarRows: value.calendars.count, teamRows: value.teams.count,
      crosswalkRows: value.crosswalks.count, unmatchedArchiveGames: value.unresolved.length, pendingStarts: value.missingStarts.length, hashes: value.hashes }, null, 2));
  } else console.info(JSON.stringify(await importScheduleBundle(files), null, 2));
} finally { await getDatabase().$disconnect(); }
