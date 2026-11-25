import { getDatabase } from "@/lib/db";
import { scoringCompleteness } from "@/scoring/completeness";
import type { StatValues } from "@/scoring/engine";

// Read-only reconciliation of accepted archive data. Never inserts score ledgers.
const database = getDatabase();
try {
  const result = await database.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const preset = await tx.scoringPreset.findUniqueOrThrow({ where: { version: "ubp-v9-experimental" }, include: { rules: true } });
    const rules = preset.rules.map((rule) => ({ sport: rule.sport, statKey: rule.statKey,
      applicability: rule.applicability, coefficientTenths: Math.round(Number(rule.coefficient) * 10) }));
    const seasons = await tx.season.findMany({ where: { games: { some: { gameStats: { some: { player: { isDemo: false, isSynthetic: false } } } } } }, orderBy: [{ sport: "asc" }, { startYear: "asc" }] });
    const reports = [];
    for (const season of seasons) {
      const rows = await tx.playerGameStat.findMany({ where: { game: { seasonId: season.id }, player: { isDemo: false, isSynthetic: false } },
        distinct: ["playerId", "gameId", "role"], orderBy: [{ revision: "desc" }, { recordedAt: "desc" }],
        select: { playerId: true, gameId: true, role: true, normalized: true, observedPositions: true } });
      reports.push({ sport: season.sport, season: season.label,
        ...scoringCompleteness(rows.map((row) => ({ ...row, normalized: row.normalized as StatValues })), rules) });
    }
    return reports;
  }, { isolationLevel: "RepeatableRead", timeout: 120_000 });
  console.log(JSON.stringify(result, null, 2));
} finally { await database.$disconnect(); }
