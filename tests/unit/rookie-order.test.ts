import { expect, it } from "vitest";
import { linearRookieSlots, weightedRookieOrder } from "@/server/rookie-order";

it("keeps the same franchise order in every rookie round", () => {
  const slots = linearRookieSlots(["last", "middle", "champion"], 3);
  expect(slots.map(({ originalTeamId }) => originalTeamId)).toEqual(["last", "middle", "champion", "last", "middle", "champion", "last", "middle", "champion"]);
  expect(slots[5]).toEqual({ originalTeamId: "champion", round: 2, roundPick: 3 });
});

it("records weighted draws without replacement and leaves unselected franchises in placement order", () => {
  const result = weightedRookieOrder({ reversePlacement: ["worst", "second", "playoff"], nonPlayoff: [{ teamId: "worst", weight: 3 }, { teamId: "second", weight: 1 }], selectedPositions: 2 }, (maximum) => maximum - 1);
  expect(result.order).toEqual(["second", "worst", "playoff"]);
});

it("rejects missing lottery configuration, invalid tickets and weights that favor better finishes", () => {
  const input = { reversePlacement: ["worst", "second"], nonPlayoff: [{ teamId: "worst", weight: 3 }, { teamId: "second", weight: 1 }], selectedPositions: 1 };
  expect(() => weightedRookieOrder({ ...input, selectedPositions: 0 })).toThrow();
  expect(() => weightedRookieOrder({ ...input, nonPlayoff: [{ teamId: "worst", weight: 1 }, { teamId: "second", weight: 2 }] })).toThrow(/worse/i);
  expect(() => weightedRookieOrder(input, () => 4)).toThrow(/ticket/i);
});
