import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { GameplayBlockedError, runBackgroundJob } from "@/server/background-jobs";
import { createLeague } from "@/server/league";
import { createDraft, processExpiredDrafts } from "@/server/draft";
import { processGameplay } from "@/server/gameplay-processor";

const database = getDatabase();
afterAll(() => database.$disconnect());

it("uses exclusive execution ownership, backoff and stale-running recovery", async () => {
  const key = `job-test:${randomUUID()}`;
  const now = new Date();
  let calls = 0;
  let release!: () => void;
  let entered!: () => void;
  const inside = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const first = runBackgroundJob(key, "fixture", async () => { calls++; entered(); await held; return 1; }, now);
  await inside;
  expect((await runBackgroundJob(key, "fixture", async () => ++calls, now)).status).toBe("SKIPPED");
  release();
  expect((await first).status).toBe("COMPLETE");
  expect(calls).toBe(1);
  await database.backgroundJobRun.update({ where: { key }, data: { status: "RUNNING", startedAt: new Date(0), result: {} } });
  expect((await runBackgroundJob(key, "fixture", async () => ++calls, now)).status).toBe("COMPLETE");
  const blockedKey = `${key}:blocked`;
  const block = await runBackgroundJob(blockedKey, "fixture", async () => { throw new GameplayBlockedError("Correct the roster."); }, now);
  expect(block.status).toBe("BLOCKED");
  expect((await runBackgroundJob(blockedKey, "fixture", async () => 1, new Date(+now + 1000))).status).toBe("SKIPPED");
  expect((await runBackgroundJob(blockedKey, "fixture", async () => 1, new Date(+now + 61000))).status).toBe("COMPLETE");
});

it("keeps healthy drafts and unrelated jobs moving while persisting an actionable roster block", async () => {
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const ids: string[] = [];
  const players = Array.from({ length: 2 }, () => randomUUID());
  await database.player.createMany({ data: players.map((id) => ({ id, sport: "NFL", displayName: "Worker fixture", isDemo: true })) });
  const now = new Date(Date.now() + 120000);
  try {
    for (let index = 0; index < 2; index++) {
      const league = await createLeague(user.id, { name: `Worker ${randomUUID()}`, sports: ["NFL"], maxTeams: 2, fillWithComputers: true, historical: true });
      ids.push(league.id);
    }
    const blocked = await createDraft(user.id, ids[0], "NFL");
    const healthy = await createDraft(user.id, ids[1], "NFL");
    const blockedTeam = blocked.pickOrder[0];
    const roster = await database.fantasyRoster.findFirstOrThrow({ where: { teamId: blockedTeam } });
    const entry = await database.rosterEntry.create({ data: {
      leagueId: ids[0], teamId: blockedTeam, rosterId: roster.id, playerId: players[0], sport: "NFL",
      seasonId: blocked.seasonId, slot: "UNIVERSAL_IR", slotIndex: 1,
    } });
    await database.draft.updateMany({ where: { id: { in: [blocked.id, healthy.id] } }, data: { pickDeadlineAt: new Date(+now - 1000) } });
    expect(await processExpiredDrafts(now)).toBe(1);
    const key = `draft-pick:${blocked.id}:1`;
    const journal = await database.backgroundJobRun.findUniqueOrThrow({ where: { key } });
    expect(journal.status).toBe("BLOCKED");
    expect(JSON.stringify(journal.result)).toContain(blockedTeam);
    await processExpiredDrafts(new Date(+now + 1000));
    expect((await database.backgroundJobRun.findUniqueOrThrow({ where: { key } })).startedAt).toEqual(journal.startedAt);
    const tick = await processGameplay(now);
    expect(tick.status).toBe("COMPLETE");
    expect(await database.backgroundJobRun.findUnique({ where: { key: `gameplay:${now.toISOString().slice(0, 16)}:trade-expiry` } })).toMatchObject({ status: "COMPLETE" });
    await database.rosterEntry.update({ where: { id: entry.id }, data: { slot: "BENCH" } });
    await processExpiredDrafts(new Date(+now + 61000));
    expect((await database.draft.findUniqueOrThrow({ where: { id: blocked.id } })).currentPick).toBe(2);
  } finally {
    await database.league.deleteMany({ where: { id: { in: ids } } });
    await database.player.deleteMany({ where: { id: { in: players } } });
  }
});
