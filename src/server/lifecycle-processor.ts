import { getDatabase } from "@/lib/db";
import { runBackgroundJob } from "./background-jobs";
import { assignNextSportSeason } from "./scheduling";
import { transitionSportSeason } from "./league";
import { expireCompletedCycleFinance } from "./financial-lifecycle";
import { hasGameplayTable } from "./gameplay-storage";

export async function processSeasonLifecycles(at = new Date()) {
  const db = getDatabase();
  const candidates = await db.leagueSportSeason.findMany({ where: { rolloverEligibleAt: { lte: at }, competition: { finalizedAt: { not: null } }, leagueSport: { league: { isHistorical: false } } }, include: { leagueSport: true, season: true } });
  const outcomes = [];
  for (const assignment of candidates) {
    if (assignment.seasonId !== assignment.leagueSport.seasonId) continue;
    const commissioner = await db.leagueMember.findFirstOrThrow({ where: { leagueId: assignment.leagueSport.leagueId, role: "COMMISSIONER" } });
    const source = await db.professionalSeasonScheduleRevision.findFirst({ where: { season: { sport: assignment.leagueSport.sport, startYear: { gt: assignment.season.startYear } }, status: "AVAILABLE", regularSeasonStartsAt: { not: null }, retrievedAt: { lte: at } } });
    if (!source) continue; // Unknown next boundaries remain explicit pending data; never infer a date.
    outcomes.push(await runBackgroundJob(`sport-rollover:${assignment.leagueSportId}:${assignment.seasonId}`, "sport-rollover", async () => {
      const next = await assignNextSportSeason(commissioner.userId, assignment.leagueSport.leagueId, assignment.leagueSport.sport);
      const season = await db.season.findUniqueOrThrow({ where: { id: next.seasonId } });
      return transitionSportSeason(commissioner.userId, assignment.leagueSport.leagueId, assignment.leagueSport.sport, season.startYear, at);
    }, at));
  }
  if (await hasGameplayTable("FinanceAccount")) {
    const cycles = await db.championshipCycle.findMany({ where: { status: "COMPLETE" } });
    for (const cycle of cycles) outcomes.push(await runBackgroundJob(`cycle-cap-expiry:${cycle.id}`, "cycle-cap-expiry", () => db.$transaction((tx) => expireCompletedCycleFinance(tx, cycle.id), { isolationLevel: "Serializable" }), at));
  }
  return outcomes;
}
