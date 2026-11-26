import { randomUUID } from "node:crypto";
import { getDatabase } from "../../src/lib/db";
import { importProfessionalSchedules } from "../../src/server/scheduling";

export async function installDraftBoundaryFixtures(leagueId: string) {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname !== "/fantasy_evolution_test" || !url.searchParams.get("schema")?.startsWith("integration_")) throw new Error("Synthetic professional evidence requires an isolated disposable schema.");
  const sports = await getDatabase().leagueSport.findMany({ where: { leagueId }, include: { season: true } });
  await importProfessionalSchedules({ provider: `isolated-draft-boundary-${randomUUID()}`, sourceName: "Explicit synthetic acceptance boundary", sourceVersion: "1", retrievedAt: new Date(),
    seasons: sports.map(({ sport, season }) => ({ sport, startYear: season.startYear, label: season.label, status: "AVAILABLE",
      regularSeasonStartsAt: new Date(Date.UTC(season.startYear, sport === "NFL" ? 8 : sport === "MLB" ? 2 : 9, 1)),
      regularSeasonEndsAt: new Date(Date.UTC(season.startYear + 1, 1, 1)) })) });
}
