import { describe, expect, it } from "vitest";
import { assessRosterCompliance, firstOpenSlot, type ComplianceEntry } from "@/rosters/compliance";

const entry = (overrides: Partial<ComplianceEntry> = {}): ComplianceEntry => ({
  id: "entry", rosterId: "nfl-roster", playerId: "player", sport: "NFL", slot: "BENCH", slotIndex: 1, irEligible: false, ...overrides,
});

describe("M4.3 roster compliance", () => {
  it("enforces sport and universal capacities independently", () => {
    const entries = [
      ...Array.from({ length: 6 }, (_, index) => entry({ id: `b${index}`, playerId: `p${index}`, slotIndex: index + 1 })),
      ...Array.from({ length: 6 }, (_, index) => entry({ id: `u${index}`, playerId: `u${index}`, slot: "UNIVERSAL_BENCH", slotIndex: index + 1 })),
    ];
    const result = assessRosterCompliance(entries, { universalBenchSlots: 5, universalIrSlots: 5, sportBenchSlots: new Map([["nfl-roster", 5]]) });
    expect(result.state).toBe("OVER_CAPACITY");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Universal bench"), expect.stringContaining("Sport roster")]));
  });

  it("does not infer IR eligibility from a slot or offseason status", () => {
    const invalid = assessRosterCompliance([entry({ slot: "UNIVERSAL_IR" })], {
      universalBenchSlots: 5, universalIrSlots: 5, sportBenchSlots: new Map([["nfl-roster", 5]]),
    });
    expect(invalid.state).toBe("IR_INELIGIBLE");
    const valid = assessRosterCompliance([entry({ slot: "UNIVERSAL_IR", irEligible: true })], {
      universalBenchSlots: 5, universalIrSlots: 5, sportBenchSlots: new Map([["nfl-roster", 5]]),
    });
    expect(valid).toEqual({ state: "COMPLIANT", reasons: [] });
  });

  it("chooses deterministic one-based open slot indexes", () => {
    expect(firstOpenSlot(new Set([1, 3, 4]), 5)).toBe(2);
    expect(firstOpenSlot(new Set([1, 2]), 2)).toBeNull();
  });
});
