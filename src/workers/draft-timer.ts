import { getDatabase } from "@/lib/db";
import { processExpiredDrafts } from "@/server/draft";

const interval = Math.max(250, Number(process.env.DRAFT_TIMER_POLL_MS ?? 1000));
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.info(JSON.stringify({ worker: "draft-timer", interval }));
  while (!stopping) {
    const started = Date.now();
    try { await processExpiredDrafts(new Date()); }
    catch (error) { console.error(error instanceof Error ? error.message : "Draft timer tick failed."); }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, interval - (Date.now() - started))));
  }
  await getDatabase().$disconnect();
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Draft timer worker failed."); process.exitCode = 1; });
