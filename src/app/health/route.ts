import { getDatabase } from "@/lib/db";

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
    return Response.json({ status: "ok", database: "connected", workers: { draftTimer, gameplayTick } }, { headers });
  } catch {
    return Response.json({ status: "unavailable", database: "unreachable" }, { status: 503, headers });
  }
}
