import { getDatabase } from "@/lib/db";

const futureSeasonCount = 3;
const rookieRounds = 4;

export function provisionFutureDraftPicks(userId: string, leagueId: string, leagueSportId: string) {
  return getDatabase().$transaction(async (tx) => {
    const sport = await tx.leagueSport.findFirstOrThrow({
      where: { id: leagueSportId, leagueId },
      include: {
        season: { select: { startYear: true } },
        league: { include: { members: { where: { userId } }, teams: { select: { id: true } } } },
      },
    });
    if (sport.league.members[0]?.role !== "COMMISSIONER") throw new Error("Only the commissioner can provision future picks.");
    if (sport.league.format === "REDRAFT") throw new Error("Redraft leagues cannot grant future picks.");
    if (sport.league.status === "SETUP") throw new Error("Finalize league setup before granting future picks.");
    const years = Array.from({ length: futureSeasonCount }, (_, index) => sport.season.startYear + index + 1);
    const drafts = years.flatMap((seasonStartYear) =>
      Array.from({ length: rookieRounds }, (_, index) => ({ seasonStartYear, round: index + 1 })));
    const grants = drafts.flatMap(({ seasonStartYear, round }) => sport.league.teams.map(({ id }) => ({
      leagueSportId, seasonStartYear, round, originalTeamId: id, ownerTeamId: id,
    })));
    const picks = await tx.futureDraftPick.createManyAndReturn({
      data: grants, skipDuplicates: true, select: { id: true, ownerTeamId: true },
    });
    if (picks.length) await tx.futureDraftPickOwnership.createMany({
      data: picks.map((pick) => ({
        pickId: pick.id, ownerTeamId: pick.ownerTeamId, reason: "Original rookie draft entitlement",
        idempotencyKey: `future-pick-grant:${pick.id}`,
      })),
    });
    return { created: picks.length };
  }, { isolationLevel: "Serializable" });
}

export async function listFutureDraftPicks(userId: string, leagueId: string, leagueSportId: string) {
  const database = getDatabase();
  const sport = await database.leagueSport.findFirstOrThrow({
    where: { id: leagueSportId, leagueId, league: { format: "DYNASTY", members: { some: { userId } } } },
    select: { season: { select: { startYear: true } } },
  });
  return database.futureDraftPick.findMany({
    where: { leagueSportId, seasonStartYear: {
      gt: sport.season.startYear, lte: sport.season.startYear + futureSeasonCount,
    } },
    include: { originalTeam: { select: { name: true } }, ownerTeam: { select: { name: true } } },
    orderBy: [{ seasonStartYear: "asc" }, { round: "asc" }, { originalTeam: { name: "asc" } }],
  });
}
