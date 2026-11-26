import { expect, it } from "vitest";
import { availableCap, auctionWinner, currency, loweredFloor, releasePenalty } from "@/finance/rules";

it("uses exact integer currency and rounded-up half salary including one-unit cuts", () => {
  expect(releasePenalty(27)).toBe(14); expect(releasePenalty(1)).toBe(1);
  expect(() => currency(0.5)).toThrow(/integer/); expect(() => currency(-1)).toThrow();
  expect(loweredFloor(7, 20)).toBe(7); expect(loweredFloor(7, 4)).toBe(4);
  expect(availableCap({ baseCap: 400, capAdjustment: -10, payroll: 300, deadCap: 20, reserved: 50 })).toBe(20);
});
it("settles second price with floors, sole bids, equal maxima and recorded priority", () => {
  const bids = [{ teamId: "high", maximum: 19, tieRank: 2 }, { teamId: "low", maximum: 7, tieRank: 1 }];
  expect(auctionWinner(bids, 1, "VICKREY")).toEqual({ teamId: "high", price: 8 });
  expect(auctionWinner([bids[0]], 14, "VICKREY").price).toBe(14);
  expect(auctionWinner([{ ...bids[0], maximum: 19 }, { ...bids[1], maximum: 19 }], 1, "VICKREY")).toEqual({ teamId: "low", price: 19 });
  expect(auctionWinner(bids, 1, "ENGLISH").price).toBe(19);
});
