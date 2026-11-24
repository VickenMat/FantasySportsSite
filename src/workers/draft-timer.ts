import { getDatabase } from "@/lib/db";
import { processExpiredDrafts } from "@/server/draft";

const interval = Math.max(250, Number(process.env.DRAFT_TIMER_POLL_MS ?? 1000));
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  const database = getDatabase();
  console.info(JSON.stringify({ worker: "draft-timer", interval }));
  await database.backgroundJobRun.upsert({ where: { key: "worker:draft-timer" }, create: { key: "worker:draft-timer", jobType: "draft-timer", status: "RUNNING", result: { heartbeatAt: new Date().toISOString(), interval } }, update: { status: "RUNNING", startedAt: new Date(), completedAt: null, result: { heartbeatAt: new Date().toISOString(), interval } } });
  let heartbeatAt = 0;
  while (!stopping) {
    const started = Date.now();
    try { await processExpiredDrafts(new Date()); }
    catch (error) { console.error(error instanceof Error ? error.message : "Draft timer tick failed."); }
    if (started - heartbeatAt >= 15_000) {
      heartbeatAt = started;
      await database.backgroundJobRun.update({ where: { key: "worker:draft-timer" }, data: { status: "RUNNING", result: { heartbeatAt: new Date(started).toISOString(), interval } } });
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, interval - (Date.now() - started))));
  }
  await database.backgroundJobRun.update({ where: { key: "worker:draft-timer" }, data: { status: "COMPLETE", completedAt: new Date(), result: { stoppedAt: new Date().toISOString(), interval } } });
  await database.$disconnect();
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Draft timer worker failed."); process.exitCode = 1; });
