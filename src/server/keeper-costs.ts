export function keeperRound(input: {
  originalYear: number; targetYear: number; draftRounds: number; originalDraftRound?: number | null;
  occupiedRounds: readonly number[];
  previousCost?: number;
}) {
  const age = input.targetYear - input.originalYear;
  if (age < 1 || age > 2) throw new Error("Keepers have a three-year maximum including the original acquisition year.");
  if (!Number.isInteger(input.draftRounds) || input.draftRounds < 1) throw new Error("A keeper requires a valid snake draft.");
  const base = input.previousCost != null ? input.previousCost - 1 : input.originalDraftRound == null
    ? Math.min(10, input.draftRounds) - (age - 1)
    : input.originalDraftRound - age;
  let round = Math.min(input.draftRounds, Math.max(1, base));
  while (input.occupiedRounds.includes(round)) round--;
  if (round < 1) throw new Error("No earlier available draft round remains for this keeper.");
  return round;
}

export function keeperPickOrder(order: readonly string[], rounds: number, costs: ReadonlyMap<string, readonly number[]>) {
  return keeperPickSlots(order, rounds, costs).map(({ teamId }) => teamId);
}

export function keeperPickSlots(order: readonly string[], rounds: number, costs: ReadonlyMap<string, readonly number[]>) {
  const result: { teamId: string; round: number; roundPick: number }[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const [index, teamId] of (round % 2 ? order : [...order].reverse()).entries()) {
      if (!costs.get(teamId)?.includes(round)) result.push({ teamId, round, roundPick: index + 1 });
    }
  }
  return result;
}
