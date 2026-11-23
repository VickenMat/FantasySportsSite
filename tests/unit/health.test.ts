import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/health/route";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDatabase: () => ({ $queryRaw: query }) }));

beforeEach(() => query.mockReset());

it("returns uncached database readiness", async () => {
  query.mockResolvedValueOnce([{ "?column?": 1 }]);
  const response = await GET();

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok", database: "connected" });
});

it("reports a database outage without leaking the underlying error", async () => {
  query.mockRejectedValueOnce(new Error("internal connection details"));
  const response = await GET();

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable", database: "unreachable" });
});
