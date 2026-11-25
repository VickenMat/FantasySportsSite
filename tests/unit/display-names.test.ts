import { describe, expect, it } from "vitest";
import { statisticDisplayName } from "@/scoring/display-names";

describe("statistic display names", () => {
  it("uses explicit product labels and readable fallbacks without changing identifiers", () => {
    expect(statisticDisplayName("fumbles_lost_total")).toBe("Fumbles Lost");
    expect(statisticDisplayName("offensive_rebounds")).toBe("Offensive Rebounds");
    expect(statisticDisplayName("blocked_shots")).toBe("Blocked Shots");
  });
});
