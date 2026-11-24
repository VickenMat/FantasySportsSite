import { expect, it } from "vitest";
import { displayTenths } from "@/server/player-statistics";

it("formats authoritative ledger tenths consistently and never invents unavailable values", () => {
  expect(displayTenths(123n)).toBe("12.3");
  expect(displayTenths(45.5)).toBe("4.5");
  expect(displayTenths(null)).toBe("N/A");
  expect(displayTenths(undefined)).toBe("N/A");
});
