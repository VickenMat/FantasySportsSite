import { getDatabase } from "@/lib/db";
import { processGameplay } from "@/server/gameplay-processor";

processGameplay().then((result) => {
  console.info(JSON.stringify(result));
  if (result.status === "FAILED") process.exitCode = 1;
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fantasy processing failed.");
  process.exitCode = 1;
}).finally(() => getDatabase().$disconnect());
