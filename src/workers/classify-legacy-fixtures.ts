import { createHash } from "node:crypto";
import { getDatabase } from "@/lib/db";

// Default is read-only. --apply requires separate development backfill approval.
const apply = process.argv.includes("--apply");
const expectedFingerprint = process.argv.find((arg) => arg.startsWith("--expected-fingerprint="))?.split("=")[1];
if (apply && !expectedFingerprint) throw new Error("--apply requires the separately approved --expected-fingerprint value.");
const fixtureNames = ["Test Tight End", "Player, Two-Way", "Test Guard", "Test Skater"];
const fixtureFiles = ["nfl.parquet", "original.csv", "corrected.csv", "NFL.csv", "appearances.csv", "two-way.csv", "MLB.csv", "mixed.csv", "NBA.csv", "NHL.csv"];

async function main() {
  const target = new URL(process.env.DATABASE_URL!);
  if (apply && target.pathname !== "/fantasy_evolution" && !target.pathname.endsWith("_test")) {
    throw new Error("Fixture classification is restricted to development and test databases.");
  }
  const database = getDatabase();
  try {
    const result = await database.$transaction(async (tx) => {
      const players = await tx.player.findMany({ where: {
        isDemo: false, isSynthetic: false, displayName: { in: fixtureNames },
        gameStats: { some: {}, every: { importBatch: { sourceName: { in: fixtureFiles } } } },
      }, select: { id: true, sport: true }, orderBy: { id: "asc" } });
      const counts: Record<string, number> = {};
      for (const player of players) counts[player.sport] = (counts[player.sport] ?? 0) + 1;
      const fingerprint = createHash("sha256").update(players.map(({ id }) => id).join("\n")).digest("hex");
      if (apply && fingerprint !== expectedFingerprint) throw new Error("Candidate IDs changed since approval. No flags were changed.");
      const changed = apply ? await tx.player.updateMany({
        where: { id: { in: players.map(({ id }) => id) }, isDemo: false, isSynthetic: false }, data: { isSynthetic: true },
      }) : { count: 0 };
      return { mode: apply ? "APPLY" : "DRY_RUN", database: target.pathname.slice(1), candidates: players.length, counts, idFingerprint: fingerprint, changed: changed.count };
    }, { isolationLevel: "Serializable" });
    console.info(JSON.stringify(result));
  } finally { await database.$disconnect(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Classification failed."); process.exitCode = 1; });
