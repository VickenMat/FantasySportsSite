import { getDatabase } from "@/lib/db";
import { processDueWaivers } from "@/server/waivers";

async function main() {
  const database = getDatabase();
  const now = new Date();
  const leagues = await database.waiverClaim.findMany({
    where: { status: "PENDING", processAt: { lte: now } }, distinct: ["leagueId"], select: { leagueId: true },
  });
  let processed = 0;
  for (const { leagueId } of leagues) processed += await processDueWaivers(leagueId, now);
  await database.$disconnect();
  console.info(JSON.stringify({ processed, leagues: leagues.length, at: now.toISOString() }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fantasy transaction worker failed.");
  process.exitCode = 1;
});
