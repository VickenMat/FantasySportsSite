export function linearRookieSlots(order: readonly string[], rounds = 4) {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 100) throw new Error("Rookie drafts support one through one hundred configured rounds.");
  if (!order.length || new Set(order).size !== order.length) throw new Error("Each franchise must appear exactly once in rookie order.");
  return Array.from({ length: rounds }, (_, round) => order.map((originalTeamId, index) => ({ originalTeamId, round: round + 1, roundPick: index + 1 }))).flat();
}
