import { createHash } from "node:crypto";

export type Candidate = { version: string; coefficientsTenths: Record<string, number> };

export function candidate(input: { version: string; coefficientsTenths: Record<string, number> }): Candidate {
  if (!/^ubp-v10-[a-z0-9-]+$/.test(input.version)) throw new Error("V10 candidate needs an explicit experimental version.");
  for (const [key, value] of Object.entries(input.coefficientsTenths)) {
    if (!key || !Number.isSafeInteger(value)) throw new Error("V10 weights must use exact one-decimal tenths.");
  }
  return { version: input.version, coefficientsTenths: Object.fromEntries(Object.entries(input.coefficientsTenths).sort()) };
}

export function candidateHash(value: Candidate) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function balanceSpread(means: Record<string, number>) {
  const values = Object.values(means);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Balance spread requires four positive sport means.");
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (Math.max(...values) - Math.min(...values)) / mean * 100;
}

export function assertTrainingOnly(rows: readonly { split: string }[]) {
  if (rows.some(({ split }) => split !== "TRAINING")) throw new Error("Optimization may read training seasons only.");
}
