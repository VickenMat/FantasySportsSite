import type { RosterComplianceState, Sport } from "@/generated/prisma/enums";

export type ComplianceEntry = {
  id: string;
  rosterId: string;
  playerId: string;
  sport: Sport;
  slot: string;
  slotIndex: number;
  irEligible: boolean;
};

export type ComplianceLimits = {
  universalBenchSlots: number;
  universalIrSlots: number;
  sportBenchSlots: ReadonlyMap<string, number>;
};

export function assessRosterCompliance(entries: readonly ComplianceEntry[], limits: ComplianceLimits) {
  const reasons: string[] = [];
  const universalBench = entries.filter(({ slot }) => slot === "UNIVERSAL_BENCH");
  const universalIr = entries.filter(({ slot }) => slot === "UNIVERSAL_IR" || slot === "IR");
  if (universalBench.length > limits.universalBenchSlots) reasons.push(`Universal bench uses ${universalBench.length}/${limits.universalBenchSlots} slots.`);
  if (universalIr.length > limits.universalIrSlots) reasons.push(`Universal IR uses ${universalIr.length}/${limits.universalIrSlots} slots.`);
  for (const entry of universalIr) if (!entry.irEligible) reasons.push(`Player ${entry.playerId} lacks current verified IR eligibility.`);

  for (const [rosterId, limit] of limits.sportBenchSlots) {
    const count = entries.filter((entry) => entry.rosterId === rosterId && entry.slot === "BENCH").length;
    if (count > limit) reasons.push(`Sport roster ${rosterId} uses ${count}/${limit} bench slots.`);
  }

  let state: RosterComplianceState = "COMPLIANT";
  if (reasons.some((reason) => reason.includes("lacks current verified IR"))) state = "IR_INELIGIBLE";
  else if (reasons.length) state = "OVER_CAPACITY";
  return { state, reasons };
}

export function firstOpenSlot(used: ReadonlySet<number>, capacity: number) {
  for (let index = 1; index <= capacity; index++) if (!used.has(index)) return index;
  return null;
}
