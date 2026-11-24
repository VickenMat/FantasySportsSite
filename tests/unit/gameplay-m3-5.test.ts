import { describe, expect, it } from "vitest";
import { teamForPick } from "@/server/draft";

describe("snake draft ordering", () => {
  for (let size = 4; size <= 16; size++) it(`reverses every round for ${size} teams`, () => {
    const order = Array.from({ length: size }, (_, index) => `team-${index + 1}`);
    const first = Array.from({ length: size }, (_, index) => teamForPick(order, index + 1));
    const second = Array.from({ length: size }, (_, index) => teamForPick(order, size + index + 1));
    const third = Array.from({ length: size }, (_, index) => teamForPick(order, size * 2 + index + 1));
    expect(first).toEqual(order);
    expect(second).toEqual([...order].reverse());
    expect(third).toEqual(order);
  });
});
