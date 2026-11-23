export type Split = "TRAINING" | "VALIDATION" | "HELD_OUT";

export function chronologicalSplit(years: readonly number[]) {
  const ordered = [...new Set(years)].sort((a, b) => a - b);
  if (ordered.length < 5) throw new Error("At least five chronological seasons are required for calibration splits.");
  const heldOutCount = Math.max(1, Math.floor(ordered.length * 0.2));
  const validationCount = Math.max(1, Math.floor((ordered.length - heldOutCount) * 0.25));
  const validationStart = ordered.length - heldOutCount - validationCount;
  const heldOutStart = ordered.length - heldOutCount;
  return Object.fromEntries(ordered.map((year, index) => [year,
    index >= heldOutStart ? "HELD_OUT" : index >= validationStart ? "VALIDATION" : "TRAINING",
  ])) as Record<number, Split>;
}
