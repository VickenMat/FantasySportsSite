import { expect, it } from "vitest";
import { workerState } from "@/server/worker-health";

it("distinguishes worker failure, staleness, missing workers and successful processing", () => {
  const now = new Date("2026-11-25T20:00:00Z");
  expect(workerState(null, now, 45000)).toBe("MISSING");
  expect(workerState({ status: "RUNNING", startedAt: new Date(0), result: {} }, now, 45000)).toBe("STALE");
  expect(workerState({ status: "FAILED", startedAt: now, result: {} }, now, 45000)).toBe("DEGRADED");
  expect(workerState({ status: "COMPLETE", startedAt: now, result: { value: { degraded: true } } }, now, 45000)).toBe("DEGRADED");
  expect(workerState({ status: "COMPLETE", startedAt: now, result: {} }, now, 45000)).toBe("HEALTHY");
});
