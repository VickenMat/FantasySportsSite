import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/health/route";

const { query, findUnique, findFirst, hasTable, blockedSchedules } = vi.hoisted(() => ({ query: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), hasTable: vi.fn(), blockedSchedules: vi.fn() }));
vi.mock("@/server/gameplay-storage", () => ({ hasGameplayTable: hasTable }));
vi.mock("@/lib/db", () => ({ getDatabase: () => ({ $queryRaw: query,
  draftPlan: { count: blockedSchedules },
  draft: { findMany: async () => [] }, backgroundJobRun: { findUnique, findFirst, count: async () => 0 } }) }));

beforeEach(() => { query.mockReset(); findUnique.mockReset(); findFirst.mockReset(); hasTable.mockReset().mockResolvedValue(false); blockedSchedules.mockReset().mockResolvedValue(0); });

it("returns uncached degradation when workers are absent despite a reachable database", async () => {
  query.mockResolvedValueOnce([{ "?column?": 1 }]);
  findUnique.mockResolvedValueOnce(null); findFirst.mockResolvedValueOnce(null);
  const response = await GET();

  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ status: "degraded", application: "available", database: "connected",
    workers: { draftTimer: null, gameplayTick: null, draftState: "MISSING", gameplayState: "MISSING" } });
});

it("reports healthy only while both workers are fresh and successful", async () => {
  query.mockResolvedValueOnce([]);
  findUnique.mockResolvedValueOnce({ status: "RUNNING", startedAt: new Date(), result: {} });
  findFirst.mockResolvedValueOnce({ status: "COMPLETE", startedAt: new Date(), result: {} });
  expect((await GET()).status).toBe(200);
});

it("reports a database outage without leaking the underlying error", async () => {
  query.mockRejectedValueOnce(new Error("internal connection details"));
  const response = await GET();

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable", database: "unreachable" });
});

it("reports degradation for a persistently blocked scheduled draft even while both workers are healthy", async () => {
  query.mockResolvedValueOnce([]); hasTable.mockResolvedValue(true); blockedSchedules.mockResolvedValue(1);
  findUnique.mockResolvedValueOnce({ status: "RUNNING", startedAt: new Date(), result: {} });
  findFirst.mockResolvedValueOnce({ status: "COMPLETE", startedAt: new Date(), result: {} });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: "degraded", blockedSchedules: 1 });
});
