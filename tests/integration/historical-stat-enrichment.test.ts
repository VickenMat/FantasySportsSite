import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { importHistoricalCsv } from "@/imports/persist";
import { fingerprint } from "@/ingestion/contracts";
import { reconcileHistoricalStatistics } from "@/server/historical-stat-enrichment";
import { recalculateScore } from '@/server/score-ledger';
import { nhlRow, writeHistoricalCsv } from "../helpers/historical-csv";

const db = getDatabase();
afterAll(() => db.$disconnect());

it('keeps an unsupported legacy shutout unknown in the V9 ledger and replays without adding entries', async () => {
  const directory=await mkdtemp(join(tmpdir(),'legacy-goalie-'));
  try {
    const externalId=String(randomInt(10000000,99999999));
    const path=await writeHistoricalCsv(join(directory,'goalie.csv'),[{...nhlRow,player_id:externalId,game_id:`202502${externalId}`,category:'goalies',position:'G',saves:'30',goalsAgainst:'0',decision:'W',toi:'65:00',starter:'True'}]);
    await importHistoricalCsv({path,sport:'NHL'});
    const player=await db.playerExternalId.findUniqueOrThrow({where:{sport_provider_externalId:{sport:'NHL',provider:'v9-historical',externalId}}});
    const prior=await db.playerGameStat.findFirstOrThrow({where:{playerId:player.playerId}});
    const legacy=await db.playerGameStat.create({data:{gameId:prior.gameId,playerId:prior.playerId,teamId:prior.teamId,importBatchId:prior.importBatchId,provider:prior.provider,role:prior.role,revision:prior.revision+1,priorRevisionId:prior.id,sourceLine:prior.sourceLine,observedPositions:prior.observedPositions,raw:{original:prior.raw},normalized:{...(prior.normalized as object),shutout:1},contentHash:fingerprint({legacyFixture:randomUUID()})}});
    const input={gameId:prior.gameId,playerId:prior.playerId,reason:'Isolated preserved legacy credit verification'};
    expect((await recalculateScore(input)).entry.missingStats).toContain('shutout');
    expect((await recalculateScore(input)).changed).toBe(false);
    expect((await db.playerGameStat.findUniqueOrThrow({where:{id:legacy.id}})).normalized).toMatchObject({shutout:1});
  } finally {await rm(directory,{recursive:true,force:true});}
});

it("appends exact missing statistics once while preserving original publication, positions and ledgers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nhl-enrichment-"));
  try {
    const externalId = String(randomInt(10000000, 99999999));
    const path = await writeHistoricalCsv(join(directory, "source.csv"), [{ ...nhlRow, player_id: externalId, game_id: `202502${externalId}` }]);
    await importHistoricalCsv({ path, sport: "NHL" });
    const player = await db.playerExternalId.findUniqueOrThrow({ where: { sport_provider_externalId: { sport: "NHL", provider: "v9-historical", externalId } } });
    const prior = await db.playerGameStat.findFirstOrThrow({ where: { playerId: player.playerId } });
    const manifest = {
      version: "real-nhl-missing-fields-1" as const,
      sourceProofs: [{ fixture: randomUUID(), sha256: fingerprint("isolated evidence") }],
      rows: [{ priorStatId: prior.id, priorContentHash: prior.contentHash, playerId: prior.playerId, gameId: prior.gameId, role: "SKATER" as const, fields: { faceoff_wins: 3, shorthanded_points_bonus: 0 }, evidence: { faceoff_wins: { completeGame: true, events: ["1", "2", "3"] }, shorthanded_points_bonus: { completeGame: true, events: [] } } }],
    };
    const dry = await reconcileHistoricalStatistics(manifest);
    expect(dry).toMatchObject({ changes: 1, applied: false, scoreLedgerChanges: 0 });
    await expect(reconcileHistoricalStatistics(manifest, { expectedFingerprint: "0".repeat(64) })).rejects.toThrow(/changed since review/);
    expect(await db.playerGameStat.count({ where: { playerId: prior.playerId } })).toBe(1);
    const applied = await reconcileHistoricalStatistics(manifest, { expectedFingerprint: dry.fingerprint });
    expect(applied).toMatchObject({ changes: 1, applied: true });
    expect(await db.playerGameStat.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
    const revision = await db.playerGameStat.findFirstOrThrow({ where: { playerId: prior.playerId }, orderBy: { revision: "desc" } });
    expect(revision).toMatchObject({ priorRevisionId: prior.id, sourceKnownAt: prior.sourceKnownAt, observedPositions: prior.observedPositions, normalized: { ...(prior.normalized as object), faceoff_wins: 3, shorthanded_points_bonus: 0 } });
    expect(await reconcileHistoricalStatistics(manifest, { expectedFingerprint: dry.fingerprint })).toMatchObject({ changes: 0, alreadyApplied: 1 });
    expect(await db.scoreLedger.count({ where: { playerId: prior.playerId } })).toBe(0);
    const known = { ...manifest, rows: [{ ...manifest.rows[0], priorStatId: revision.id, priorContentHash: revision.contentHash }] };
    await expect(reconcileHistoricalStatistics(known)).rejects.toThrow(/Known statistics/);
    const missingEvidence = { ...manifest, rows: [{ ...manifest.rows[0], evidence: {} }] };
    // Use a changed manifest to prove an existing revision cannot be silently replaced.
    await expect(reconcileHistoricalStatistics(missingEvidence)).rejects.toThrow(/newer historical revision/);
    expect(await db.playerGameStat.count({ where: { playerId: prior.playerId } })).toBe(2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
