import { getDatabase } from "@/lib/db";
import { processExpiredDrafts } from "@/server/draft";
import { processScheduledDrafts } from "@/server/draft-plans";
import { processDueAuctions, processAuctionDraftClocks } from "@/server/auctions";
import { Client } from "pg";

const interval = Math.max(250, Number(process.env.DRAFT_TIMER_POLL_MS ?? 1000));
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  const database = getDatabase();
  const owner = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  await owner.connect();
  const claim = await owner.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtextextended('worker:draft-timer', 0)) AS acquired");
  if (!claim.rows[0].acquired) {
    await owner.end();
    await database.$disconnect();
    throw new Error("A draft timer already owns this database. Stop the existing project stack before starting another.");
  }
  owner.on("error", () => { stopping = true; });
  console.info(JSON.stringify({ worker: "draft-timer", interval }));
  await database.backgroundJobRun.upsert({ where: { key: "worker:draft-timer" }, create: { key: "worker:draft-timer", jobType: "draft-timer", status: "RUNNING", result: { heartbeatAt: new Date().toISOString(), interval } }, update: { status: "RUNNING", startedAt: new Date(), completedAt: null, result: { heartbeatAt: new Date().toISOString(), interval } } });
  let heartbeatAt = 0;
  let failures = 0;
  let retryAt = 0;
  let lastError: string | null = null;
  while (!stopping) {
    const started = Date.now();
    if (started >= retryAt) {
      try { const at = new Date(); await processScheduledDrafts(at); await processDueAuctions(at); await processAuctionDraftClocks(at); await processExpiredDrafts(at); failures = 0; lastError = null; }
      catch (error) {
        failures++;
        lastError = error instanceof Error ? error.message : "Draft timer tick failed.";
        retryAt = started + Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4));
        console.error(JSON.stringify({ worker: "draft-timer", error: lastError, retryAt: new Date(retryAt).toISOString() }));
      }
    }
    if (started - heartbeatAt >= 15_000) {
      heartbeatAt = started;
      await database.backgroundJobRun.update({ where: { key: "worker:draft-timer" }, data: { status: lastError ? "FAILED" : "RUNNING", result: { heartbeatAt: new Date(started).toISOString(), interval, error: lastError } } });
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, interval - (Date.now() - started))));
  }
  await database.backgroundJobRun.update({ where: { key: "worker:draft-timer" }, data: { status: "COMPLETE", completedAt: new Date(), result: { stoppedAt: new Date().toISOString(), interval } } });
  await database.$disconnect();
  await owner.end();
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Draft timer worker failed."); process.exitCode = 1; });
