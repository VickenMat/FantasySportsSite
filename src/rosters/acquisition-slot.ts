import type { Sport } from "@/generated/prisma/enums";
import { fitsSlot } from "@/simulation/config";
import { firstOpenSlot } from "./compliance";

export function openAcquisitionSlot(input: { sport: Sport; rosterId: string; starters: string[]; bench: number; universalBench: number;
  positions: ReadonlySet<string>; entries: { rosterId: string; slot: string; slotIndex: number }[] }) {
  const slots = [...input.starters, "BENCH", "UNIVERSAL_BENCH"];
  for (const slot of new Set(slots)) {
    if (slot !== "BENCH" && slot !== "UNIVERSAL_BENCH" && !fitsSlot(input.sport, slot, input.positions)) continue;
    const capacity = slot === "BENCH" ? input.bench : slot === "UNIVERSAL_BENCH" ? input.universalBench : input.starters.filter((value) => value === slot).length;
    const occupied = input.entries.filter((entry) => entry.slot === slot && (slot === "UNIVERSAL_BENCH" || entry.rosterId === input.rosterId));
    const slotIndex = firstOpenSlot(new Set(occupied.map(({ slotIndex }) => slotIndex)), capacity);
    if (slotIndex) return { slot, slotIndex };
  }
  return null;
}
