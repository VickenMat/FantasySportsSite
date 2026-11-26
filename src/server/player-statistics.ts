import { getDatabase } from "@/lib/db";
import { calculateScore, type StatValues } from "@/scoring/engine";
import { historicalProvider } from "@/imports/normalize";
import { historicalStatsForScoring } from '@/scoring/historical-evidence';
import { combineParticipationEvidence, participationEvidence, referencedHistoricalStatId, type ParticipationEvidence } from '@/scoring/participation';
import type { GameStatRole } from '@/generated/prisma/enums';

export type PlayerStatistics = { gamesPlayed: number | null; knownPlayedGames: number; unknownParticipationGames: number; didNotPlayRecords: number; scoredGames: number; totalTenths: bigint | null; averageTenths: number | null; projectionTenths: null };
type SelectedStat = { role:GameStatRole;provider:string;normalized:unknown;raw:unknown };

export async function playerStatistics(input: { playerIds: string[]; presetId: string; seasonId: string; asOf?: Date }) {
  const ids = [...new Set(input.playerIds)];
  if (!ids.length) return new Map<string, PlayerStatistics>();
  const asOf = input.asOf;
  const ledgers = await getDatabase().scoreLedger.findMany({
    where: {
      playerId: { in: ids }, presetId: input.presetId,
      game: { seasonId: input.seasonId, ...(asOf ? { OR: [{ startsAt: { lte: asOf } }, { startsAt: null, gameDate: { lte: asOf } }] } : {}) },
    },
    select: {
      playerId: true, gameId: true,
      entries: {
        ...(asOf ? { where: { stat: { OR: [{ sourceKnownAt: { lte: asOf } }, { sourceKnownAt: null, recordedAt: { lte: asOf } }] } } } : {}),
        orderBy: { sequence: "desc" }, take: 1, select: { totalTenths: true, missingStats: true, stat:{select:{role:true,provider:true,normalized:true,raw:true}} },
      },
    },
  });
  const perGame = new Map<string, { playerId: string; score: bigint | null; participation:ParticipationEvidence;selectedStat?:SelectedStat }>();
  for (const ledger of ledgers) {
    const entry = ledger.entries[0];
    if (!entry) continue;
    perGame.set(`${ledger.playerId}:${ledger.gameId}`, { playerId: ledger.playerId, score: entry.missingStats.length ? null : entry.totalTenths, selectedStat:entry.stat,participation:entry.stat?participationEvidence({...entry.stat,normalized:entry.stat.normalized as StatValues}):{status:'UNKNOWN',reason:'PARTICIPATION_EVIDENCE_MISSING'} });
  }
  // Historical analytics can be computed without creating competitive ledger events.
  // Unknown fields or ambiguous two-way roles produce an unknown total, never zero.
  const [rows, rules] = await Promise.all([
    getDatabase().playerGameStat.findMany({ where: { playerId: { in: ids }, game: { seasonId: input.seasonId,
      ...(asOf ? { OR: [{ startsAt: { lte: asOf } }, { startsAt: null, gameDate: { lte: asOf } }] } : {}) },
      ...(asOf ? { OR: [{ sourceKnownAt: { lte: asOf } }, { sourceKnownAt: null, recordedAt: { lte: asOf } }] } : {}) },
      orderBy: [{ revision: "desc" }, { recordedAt: "desc" }],
      distinct: ["playerId", "gameId", "provider", "role"],
      select: { id:true,priorRevisionId:true,playerId: true, gameId: true, provider: true, raw: true, role: true, normalized: true, observedPositions: true } }),
    getDatabase().scoringRule.findMany({ where: { presetId: input.presetId } }),
  ]);
  const weights = rules.map((rule) => ({ sport: rule.sport, statKey: rule.statKey, applicability: rule.applicability,
    coefficientTenths: Math.round(Number(rule.coefficient) * 10) }));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.playerId}:${row.gameId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [key, appearances] of groups) {
    const historical = appearances.filter(row=>row.provider===historicalProvider);
    const legacy = appearances.filter(row=>!(row.raw&&typeof row.raw==="object"&&"professionalObservation" in row.raw));
    const candidates = historical.length ? historical : legacy;
    const row = candidates[0] ?? appearances[0];
    const chosen=perGame.get(key);
    if(chosen){
      if(!chosen.selectedStat)chosen.participation=combineParticipationEvidence((candidates.length?candidates:appearances).map(value=>({...value,normalized:value.normalized as StatValues})));
      else if(chosen.participation.status==='UNKNOWN'&&chosen.participation.reason==='PARTICIPATION_EVIDENCE_MISSING'){
        // Hybrid sources may cite an accepted historical row instead of repeating TOI.
        const reference=referencedHistoricalStatId(chosen.selectedStat.raw);
        const evidence=reference?candidates.filter(value=>value.role===chosen.selectedStat!.role&&(value.id===reference||value.priorRevisionId===reference)):[];
        if(evidence.length)chosen.participation=combineParticipationEvidence(evidence.map(value=>({...value,normalized:value.normalized as StatValues})));
      }
      continue;
    }
    let score: bigint | null = null;
    if (candidates.length === 1) {
      const result = calculateScore(weights, { role: row.role, stats: historicalStatsForScoring({...row,normalized:row.normalized as StatValues}),
        teEligible: row.role === "FOOTBALL" && row.observedPositions.length ? row.observedPositions.includes("TE") : null });
      if (!result.missingStats.length) score = BigInt(result.totalTenths);
    }
    perGame.set(key, { playerId: row.playerId, score,participation:combineParticipationEvidence((candidates.length?candidates:appearances).map(value=>({...value,normalized:value.normalized as StatValues}))) });
  }
  const totals = new Map<string, { knownPlayedGames:number;unknownParticipationGames:number;didNotPlayRecords:number;records:number;scoredRecords:number;scoredGames: number; totalTenths: bigint }>();
  for (const { playerId, score,participation } of perGame.values()) {
    const value = totals.get(playerId) ?? { knownPlayedGames:0,unknownParticipationGames:0,didNotPlayRecords:0,records:0,scoredRecords:0,scoredGames:0,totalTenths:0n };
    totals.set(playerId,value);
    if(participation.status==='DID_NOT_PLAY'){value.didNotPlayRecords++;continue;}
    value.records++;
    if(participation.status==='PLAYED')value.knownPlayedGames++;else value.unknownParticipationGames++;
    if (score != null) { value.scoredRecords++;if(participation.status==='PLAYED')value.scoredGames++; value.totalTenths += score; }
  }
  return new Map([...totals].map(([playerId, value]) => [playerId, {
    knownPlayedGames:value.knownPlayedGames,unknownParticipationGames:value.unknownParticipationGames,didNotPlayRecords:value.didNotPlayRecords,scoredGames:value.scoredGames,
    gamesPlayed:value.unknownParticipationGames?null:value.knownPlayedGames,
    totalTenths: value.scoredRecords === value.records ? value.totalTenths : null,
    averageTenths: !value.unknownParticipationGames&&value.knownPlayedGames>0&&value.scoredRecords === value.records ? Number(value.totalTenths) / value.knownPlayedGames : null,
    projectionTenths: null,
  }]));
}

export function displayTenths(value: bigint | number | null | undefined) {
  return value == null ? "N/A" : (Number(value) / 10).toFixed(1);
}
