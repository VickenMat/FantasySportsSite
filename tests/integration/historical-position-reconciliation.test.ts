import "dotenv/config";
import { randomInt } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { importHistoricalCsv } from "@/imports/persist";
import { reconcileHistoricalPositions } from "@/server/historical-position-reconciliation";
import { nbaRow, writeHistoricalCsv } from "../helpers/historical-csv";

const db = getDatabase();
afterAll(() => db.$disconnect());

it("fills historical position observations idempotently without changing normalized stats, canonical IDs or eligibility", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fantasy-position-repair-"));
  const externalId = String(randomInt(10_000_000, 99_000_000));
  try {
    const path = await writeHistoricalCsv(join(dir, "nba-position-fixture.csv"), [{ ...nbaRow, PLAYER_ID: externalId, GAME_ID: String(randomInt(100_000_000, 999_000_000)) }]);
    await importHistoricalCsv({ path, sport: "NBA" });
    const identity = await db.playerExternalId.findUniqueOrThrow({ where: { sport_provider_externalId: { sport: "NBA", provider: "v9-historical", externalId } } });
    await db.player.update({ where: { id: identity.playerId }, data: { isSynthetic: true } });
    const original = await db.playerGameStat.findFirstOrThrow({ where: { playerId: identity.playerId } });
    const ledgerCount = await db.scoreLedgerEntry.count();
    const input = { sport: "NBA" as const, sourceName: "isolated-verified-positions.json", sourceProvider: "isolated-fixture", rows: [{ playerExternalId: externalId,
      identityProvider: "v9-historical", seasonStartYear: 2025, positions: ["PG", "SG"], verificationStatus: "VERIFIED" as const,
      sourceReference: "synthetic fixture only", knownAt: new Date("2025-10-26") }] };
    const dry = await reconcileHistoricalPositions(input);
    expect(dry).toMatchObject({ changes: 1, players: 1, applied: false });
    expect(await db.playerGameStat.count({ where: { playerId: identity.playerId } })).toBe(1);
    await expect(reconcileHistoricalPositions(input, { expectedFingerprint: "wrong" })).rejects.toThrow(/fingerprint/i);
    expect(await reconcileHistoricalPositions(input, { expectedFingerprint: dry.fingerprint })).toMatchObject({ changes: 1, applied: true });
    const revised = await db.playerGameStat.findFirstOrThrow({ where: { playerId: identity.playerId }, orderBy: { revision: "desc" } });
    expect(revised).toMatchObject({ playerId: identity.playerId, gameId: original.gameId, normalized: original.normalized, observedPositions: ["PG", "SG"], priorRevisionId: original.id, revision: 2 });
    expect(await db.playerGameStat.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
    expect((await reconcileHistoricalPositions(input)).changes).toBe(0);
    expect((await reconcileHistoricalPositions(input, { expectedFingerprint: dry.fingerprint })).changes).toBe(0);
    expect(await db.playerPositionEvidence.count({ where: { playerId: identity.playerId } })).toBe(0);
    expect(await db.scoreLedgerEntry.count()).toBe(ledgerCount);
    await expect(reconcileHistoricalPositions({ ...input, rows: [{ ...input.rows[0], positions: ["C"] }] })).rejects.toThrow(/conflicting/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
