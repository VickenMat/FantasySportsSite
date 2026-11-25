import { Client } from "pg";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

export class GameplayBlockedError extends Error {}

type Outcome<T> = { status: "COMPLETE"; value: T } | { status: "SKIPPED" | "BLOCKED" | "FAILED"; error?: string };

// A session advisory lock is the execution lease. PostgreSQL releases it on process
// death, so a new owner can recover a stale RUNNING journal without overlapping work.
export async function runBackgroundJob<T>(key: string, jobType: string, work: () => Promise<T>, now = new Date()): Promise<Outcome<T>> {
  const lock = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  const database = getDatabase();
  const target = new URL(process.env.DATABASE_URL!);
  const lockKey = `${target.pathname}:${target.searchParams.get("schema") ?? "public"}:${key}`;
  await lock.connect();
  try {
    const claim = await lock.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [lockKey]);
    if (!claim.rows[0].acquired) return { status: "SKIPPED" };
    const previous = await database.backgroundJobRun.findUnique({ where: { key } });
    const prior = previous?.result as { attempts?: number; retryAt?: string } | null;
    if (previous?.status === "COMPLETE" || (prior?.retryAt && new Date(prior.retryAt) > now)) return { status: "SKIPPED" };
    const attempts = (prior?.attempts ?? 0) + 1;
    await database.backgroundJobRun.upsert({ where: { key },
      create: { key, jobType, status: "RUNNING", startedAt: now, result: { attempts } },
      update: { status: "RUNNING", startedAt: now, completedAt: null, result: { attempts } },
    });
    try {
      const value = await work();
      await database.backgroundJobRun.update({ where: { key }, data: {
        status: "COMPLETE", completedAt: new Date(), result: { attempts, value } as Prisma.InputJsonValue,
      } });
      return { status: "COMPLETE", value };
    } catch (error) {
      const blocked = error instanceof GameplayBlockedError;
      const message = error instanceof Error ? error.message : "Unknown processing failure.";
      const delay = blocked ? 60_000 : Math.min(300_000, 5_000 * 2 ** Math.min(attempts - 1, 6));
      const status = blocked ? "BLOCKED" : "FAILED";
      await database.backgroundJobRun.update({ where: { key }, data: { status, completedAt: new Date(),
        result: { attempts, error: message, retryAt: new Date(now.getTime() + delay).toISOString() },
      } });
      return { status, error: message };
    }
  } finally {
    await lock.end();
  }
}
