import { describe, expect, it } from "vitest";
import { balanceSpread, candidate, candidateHash, assertTrainingOnly } from "@/calibration/optimizer";
import { chronologicalSplit } from "@/calibration/splits";

describe("chronological calibration controls", () => {
  it("freezes ordered training, validation and held-out seasons", () => {
    const split = chronologicalSplit([2025, 2018, 2021, 2020, 2019, 2024, 2022, 2023]);
    expect(split[2018]).toBe("TRAINING");
    expect(split[2024]).toBe("VALIDATION");
    expect(split[2025]).toBe("HELD_OUT");
    expect(() => assertTrainingOnly([{ split: "TRAINING" }, { split: "HELD_OUT" }])).toThrow(/training/i);
  });

  it("keeps V10 proposals versioned, deterministic and in exact tenths", () => {
    const value = candidate({ version: "ubp-v10-test-1", coefficientsTenths: { b: -5, a: 12 } });
    expect(value.coefficientsTenths).toEqual({ a: 12, b: -5 });
    expect(candidateHash(value)).toBe(candidateHash(value));
    expect(() => candidate({ version: "ubp-v9", coefficientsTenths: { a: 1 } })).toThrow(/V10/i);
    expect(() => candidate({ version: "ubp-v10-bad", coefficientsTenths: { a: 1.5 } })).toThrow(/one-decimal/i);
  });

  it("uses the declared cross-sport spread formula", () => {
    expect(balanceSpread({ NFL: 100, NBA: 100, MLB: 100, NHL: 100 })).toBe(0);
    expect(balanceSpread({ NFL: 101, NBA: 100, MLB: 100, NHL: 99 })).toBeCloseTo(2);
  });
});
