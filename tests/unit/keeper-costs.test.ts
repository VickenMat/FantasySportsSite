import { expect, it } from "vitest";
import { keeperPickOrder, keeperRound } from "@/server/keeper-costs";

it("escalates drafted and undrafted keeper costs, including short draft fallback and conflicts", () => {
  expect(keeperRound({ originalYear: 2024, targetYear: 2025, draftRounds: 14, originalDraftRound: 7, occupiedRounds: [] })).toBe(6);
  expect(keeperRound({ originalYear: 2024, targetYear: 2026, draftRounds: 14, originalDraftRound: 7, occupiedRounds: [] })).toBe(5);
  expect(keeperRound({ originalYear: 2024, targetYear: 2025, draftRounds: 4, occupiedRounds: [] })).toBe(4);
  expect(keeperRound({ originalYear: 2024, targetYear: 2026, draftRounds: 4, occupiedRounds: [3] })).toBe(2);
  expect(keeperRound({ originalYear: 2024, targetYear: 2026, draftRounds: 14, originalDraftRound: 7, previousCost: 4, occupiedRounds: [] })).toBe(3);
  expect(() => keeperRound({ originalYear: 2024, targetYear: 2027, draftRounds: 14, occupiedRounds: [] })).toThrow(/three-year/);
  expect(() => keeperRound({ originalYear: 2024, targetYear: 2025, draftRounds: 1, originalDraftRound: 1, occupiedRounds: [1] })).toThrow(/No earlier/);
});

it("consumes the exact keeper round while preserving the snake order", () => {
  expect(keeperPickOrder(["a", "b"], 3, new Map([["a", [2]]]))).toEqual(["a", "b", "b", "a", "b"]);
});
