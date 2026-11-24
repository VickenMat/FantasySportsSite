import { getDatabase } from "@/lib/db";
import { processDueWaivers } from "@/server/waivers";
import { autoPickExpiredDraft } from "@/server/draft";
import { setComputerLineups } from "@/server/rosters";

async function main() {
  const database = getDatabase();
  const now = new Date();
  const minute = now.toISOString().slice(0, 16);
  const key = `fantasy-tick:${minute}`;
  const claimed = await database.backgroundJobRun.create({ data: { key, jobType: "fantasy-tick", status: "RUNNING" } })
    .catch(async (error: unknown) => {
      const existing = await database.backgroundJobRun.findUnique({ where: { key } });
      if (!existing) throw error;
      if (existing?.status !== "FAILED") return null;
      return database.backgroundJobRun.update({ where: { key }, data: { status: "RUNNING", startedAt: now, completedAt: null, result: undefined } });
    });
  if (!claimed) {
    console.info(JSON.stringify({ skipped: true, key }));
    await database.$disconnect();
    return;
  }
  try {
    const leagues = await database.waiverClaim.findMany({
      where: { status: "PENDING", processAt: { lte: now } }, distinct: ["leagueId"], select: { leagueId: true },
    });
    let processed = 0;
    for (const { leagueId } of leagues) processed += await processDueWaivers(leagueId, now);
    const drafts = await database.draft.findMany({ where: { status: "ACTIVE", pickStartedAt: { not: null } }, select: { id: true, pickStartedAt: true, secondsPerPick: true } });
    let automaticPicks = 0;
    for (const draft of drafts) if (draft.pickStartedAt!.getTime() + draft.secondsPerPick * 1000 <= now.getTime()) {
      if (await autoPickExpiredDraft(draft.id, now)) automaticPicks++;
    }
    const expiredTrades = await database.trade.updateMany({ where: { status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
    const activeSports = await database.leagueSport.findMany({ where: { league: { status: "ACTIVE" }, rosters: { some: { team: { isComputer: true } } } }, select: { leagueId: true, sport: true } });
    let computerLineupSlots = 0;
    for (const item of activeSports) computerLineupSlots += await setComputerLineups(item.leagueId, item.sport, now);
    const cleanedRateLimits = await database.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
    const result = { processed, leagues: leagues.length, automaticPicks, computerLineupSlots, expiredTrades: expiredTrades.count, cleanedRateLimits: cleanedRateLimits.count, at: now.toISOString() };
    await database.backgroundJobRun.update({ where: { key }, data: { status: "COMPLETE", completedAt: new Date(), result } });
    await database.$disconnect();
    console.info(JSON.stringify(result));
  } catch (error) {
    await database.backgroundJobRun.update({ where: { key }, data: { status: "FAILED", completedAt: new Date(), result: { error: error instanceof Error ? error.message : "Unknown error" } } });
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fantasy transaction worker failed.");
  process.exitCode = 1;
});
