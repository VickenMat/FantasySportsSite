import { getDatabase } from "@/lib/db";
import { scoringCompleteness } from "@/scoring/completeness";
import type { StatValues } from "@/scoring/engine";
import { historicalStatsForScoring } from '@/scoring/historical-evidence';

// Read-only reconciliation of accepted archive data. Never inserts score ledgers.
const database = getDatabase();
const archiveOnly=process.argv.includes("--historical-archive-only");
try {
  const result = await database.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const preset = await tx.scoringPreset.findUniqueOrThrow({ where: { version: "ubp-v9-experimental" }, include: { rules: true } });
    const rules = preset.rules.map((rule) => ({ sport: rule.sport, statKey: rule.statKey,
      applicability: rule.applicability, coefficientTenths: Math.round(Number(rule.coefficient) * 10) }));
    const seasons = await tx.season.findMany({ where: { games: { some: { gameStats: { some: { player: { isDemo: false, isSynthetic: false } } } } } }, orderBy: [{ sport: "asc" }, { startYear: "asc" }] });
    const reports = [];
    for (const season of seasons) {
      const rows = await tx.playerGameStat.findMany({ where: { ...(archiveOnly?{provider:"v9-historical"}:{}), game: { seasonId: season.id }, player: { isDemo: false, isSynthetic: false } },
        distinct: ["playerId", "gameId", "role"], orderBy: [{ revision: "desc" }, { recordedAt: "desc" }],
        select: { id:true, playerId: true, gameId: true, role: true, normalized: true, observedPositions: true, provider: true, raw: true } });
      const rawAppearances=rows.map(row=>({...row,normalized:row.normalized as StatValues}));
            const selections=await tx.scoreLedger.findMany({where:{presetId:preset.id,game:{seasonId:season.id},player:{isDemo:false,isSynthetic:false}},select:{playerId:true,gameId:true,role:true,entries:{orderBy:{sequence:"desc"},take:1,select:{statId:true,teEligible:true}}}});
      const boundContext=new Map(selections.flatMap(row=>row.entries.filter(entry=>typeof entry.teEligible==="boolean").map(entry=>[entry.statId,entry.teEligible!] as const)));
      const appearances=rawAppearances.map(row=>({...row,normalized:historicalStatsForScoring(row),...(row.role==="FOOTBALL"&&boundContext.has(row.id)?{teEligible:boundContext.get(row.id)}:{})}));
      reports.push({ sport: season.sport, season: season.label, scope:archiveOnly?"HISTORICAL_ARCHIVE_PROVIDER":"ALL_ACCEPTED_SOURCE_HEADS",boundScoringContextAppearances:appearances.filter(row=>row.teEligible!==undefined).length,
        ...scoringCompleteness(appearances,rules,new Map(selections.map(row=>[`${row.playerId}:${row.gameId}`,row.role]))),
        fixedScoringRoles:selections.length,rawArchiveIssues:scoringCompleteness(rawAppearances,rules).issues });
    }
    return reports;
  }, { isolationLevel: "RepeatableRead", timeout: 120_000 });
  console.log(JSON.stringify(result, null, 2));
} finally { await database.$disconnect(); }
