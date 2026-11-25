import { getDatabase } from "@/lib/db";
import { runBackgroundJob } from "./background-jobs";
import { captureDueGameLineups } from "./lineup-snapshots";
import { processDueWaivers } from "./waivers";
import { processExpiredDrafts } from "./draft";
import { setComputerLineups } from "./rosters";
import { finalizeDueMatchups } from "./matchups";

export async function processGameplay(now = new Date()) {
  const database = getDatabase();
  const minute = now.toISOString().slice(0, 16);
  return runBackgroundJob(`fantasy-tick:${minute}`, "fantasy-tick", async () => {
    const outcomes: { task: string; status: string; error?: string }[] = [];
    async function task(name: string, work: () => Promise<unknown>) {
      const result = await runBackgroundJob(`gameplay:${minute}:${name}`, "gameplay-task", work, now);
      outcomes.push({ task: name, status: result.status, ...("error" in result ? { error: result.error } : {}) });
    }
    await task("lineup-capture", () => captureDueGameLineups(now));
    await task("waivers", async () => {
      const leagues = await database.waiverClaim.findMany({ where: { status: "PENDING", processAt: { lte: now } },
        distinct: ["leagueId"], select: { leagueId: true } });
      for (const { leagueId } of leagues) await task(`waivers:${leagueId}`, () => processDueWaivers(leagueId, now));
      return leagues.length;
    });
    await task("automatic-drafts", () => processExpiredDrafts(now));
    await task("finalization", async () => {
      const leagues = await database.matchup.findMany({ where: { finalizedAt: null, resultFinalizesAt: { lte: now } },
        distinct: ["leagueId"], select: { leagueId: true } });
      for (const { leagueId } of leagues) await task(`finalization:${leagueId}`, () => finalizeDueMatchups(now, leagueId));
      return leagues.length;
    });
    await task("trade-expiry", () => database.trade.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now },
    }));
    await task("computer-lineups", async () => {
      const sports = await database.leagueSport.findMany({ where: { league: { status: "ACTIVE" },
        rosters: { some: { team: { isComputer: true } } } }, select: { leagueId: true, sport: true } });
      for (const item of sports) await task(`computer:${item.leagueId}:${item.sport}`, () => setComputerLineups(item.leagueId, item.sport, now));
      return sports.length;
    });
    await task("rate-limit-cleanup", () => database.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }));
    return { outcomes, degraded: outcomes.some(({ status }) => status === "FAILED" || status === "BLOCKED"), at: now.toISOString() };
  }, now);
}
