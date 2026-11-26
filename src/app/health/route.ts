import { draftJobKey } from "@/server/draft-corrections";
import { getDatabase } from "@/lib/db";
import { workerState } from "@/server/worker-health";
import { hasGameplayTable } from "@/server/gameplay-storage";
import { releaseOperations } from '@/ingestion/open-data/operations';

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    const database = getDatabase();
    await database.$queryRaw`SELECT 1`;
    const [draftTimer, gameplayTick] = await Promise.all([
      database.backgroundJobRun.findUnique({ where: { key: "worker:draft-timer" }, select: { status: true, startedAt: true, completedAt: true, result: true } }),
      database.backgroundJobRun.findFirst({ where: { jobType: "fantasy-tick" }, orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, completedAt: true, result: true } }),
    ]);
    const now = new Date();
    const activeDrafts = await database.draft.findMany({ where: { status: "ACTIVE" }, select: { id: true, currentPick: true, orderProvenance: true } });
    const blockedDrafts = await database.backgroundJobRun.count({ where: { jobType: "draft-pick", status: "BLOCKED",
      key: { in: activeDrafts.map((draft) => draftJobKey(draft)) } } });
    const blockedSchedules = await hasGameplayTable("DraftPlan") ? await database.draftPlan.count({ where: { status: "BLOCKED" } }) : 0;
    const draftState = workerState(draftTimer, now, 45_000);
    const gameplayState = workerState(gameplayTick, now, 150_000);
    const healthy = draftState === "HEALTHY" && gameplayState === "HEALTHY" && blockedDrafts === 0 && blockedSchedules === 0;
    const releases=await releaseOperations(now).catch(()=>({worker:'UNAVAILABLE',products:[],competitiveScoring:'PENDING_AUTHORITATIVE_TIMESTAMPS'}));
    return Response.json({ status: healthy ? "ok" : "degraded", application: "available", database: "connected",
      workers: { draftTimer, gameplayTick, draftState, gameplayState,data:releases.worker }, blockedDrafts, blockedSchedules,
      data:{enabledBatchSources:releases.products.filter(p=>p.enabled).length,synchronized:releases.products.filter(p=>p.status==='SYNCHRONIZED').length,retrying:releases.products.filter(p=>p.status==='RETRYING').length,stale:releases.products.filter(p=>p.sourceFreshness==='STALE').length,liveFeedEnabled:false,competitiveScoring:releases.competitiveScoring},leagueHealth:blockedDrafts||blockedSchedules?'BLOCKED':'HEALTHY' },
      { headers, status: healthy ? 200 : 503 });
  } catch {
    return Response.json({ status: "unavailable", database: "unreachable" }, { status: 503, headers });
  }
}
