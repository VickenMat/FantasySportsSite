import { expect, it } from "vitest";
import { linearRookieSlots } from "@/server/rookie-order";

it("keeps the same franchise order in every rookie round", () => {
  const slots = linearRookieSlots(["last", "middle", "champion"], 3);
  expect(slots.map(({ originalTeamId }) => originalTeamId)).toEqual(["last", "middle", "champion", "last", "middle", "champion", "last", "middle", "champion"]);
  expect(slots[5]).toEqual({ originalTeamId: "champion", round: 2, roundPick: 3 });
});

it("rejects duplicate franchises and unsupported round counts", () => {
  expect(() => linearRookieSlots(["worst", "worst"], 4)).toThrow(/exactly once/);
  expect(() => linearRookieSlots(["worst", "best"], 0)).toThrow(/rounds/);
});
