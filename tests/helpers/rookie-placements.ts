import { getDatabase } from "../../src/lib/db";

/** Explicit finalized standings evidence confined to the disposable test schema. */
export async function finalizeRookiePlacements(leagueSportId: string, worstToBest: string[]) {
  const target = new URL(process.env.DATABASE_URL!);
  if (target.pathname !== "/fantasy_evolution_test" || !target.searchParams.get("schema")?.startsWith("integration_")) throw new Error("Synthetic placements require an isolated disposable schema.");
  const db = getDatabase();
  const competition = await db.sportCompetition.findFirstOrThrow({ where: { leagueSportSeason: { leagueSportId } }, orderBy: { leagueSportSeason: { season: { startYear: "desc" } } } });
  await db.sportCompetition.update({ where: { id: competition.id }, data: { status: "FINALIZED", finalizedAt: new Date() } });
  await db.sportFinalPlacement.createMany({ data: worstToBest.map((teamId, index) => ({ sportCompetitionId: competition.id, teamId, placement: worstToBest.length - index, finalizedAt: new Date() })) });
}
