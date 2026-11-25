import { randomInt } from "node:crypto";

export function linearRookieSlots(order: readonly string[], rounds = 4) {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 4) throw new Error("Rookie drafts support one through four rounds.");
  if (!order.length || new Set(order).size !== order.length) throw new Error("Each franchise must appear exactly once in rookie order.");
  return Array.from({ length: rounds }, (_, round) => order.map((originalTeamId, index) => ({ originalTeamId, round: round + 1, roundPick: index + 1 }))).flat();
}

/** No lottery defaults: the commissioner supplies every weight and selected-position count. */
export function weightedRookieOrder(input: { reversePlacement: string[]; nonPlayoff: { teamId: string; weight: number }[]; selectedPositions: number }, draw = randomInt) {
  const { reversePlacement, nonPlayoff, selectedPositions } = input;
  const teams = nonPlayoff.map(({ teamId }) => teamId);
  if (new Set(reversePlacement).size !== reversePlacement.length || new Set(teams).size !== teams.length ||
    teams.some((id) => !reversePlacement.includes(id)) || !Number.isInteger(selectedPositions) || selectedPositions < 1 || selectedPositions > teams.length ||
    nonPlayoff.some(({ weight }) => !Number.isSafeInteger(weight) || weight < 1)) throw new Error("Supply valid non-playoff lottery weights and selected positions.");
  // Worse final finish must receive greater odds. Ties need an explicitly resolved final placement first.
  const pool = reversePlacement.filter((id) => teams.includes(id)).map((id) => nonPlayoff.find(({ teamId }) => teamId === id)!);
  if (pool.some((entry, index) => index > 0 && pool[index - 1].weight <= entry.weight)) throw new Error("Worse finishes must have greater lottery weights.");
  const winners: string[] = []; const draws: { total: number; ticket: number; teamId: string }[] = [];
  for (let index = 0; index < selectedPositions; index++) {
    const total = pool.reduce((sum, { weight }) => sum + weight, 0);
    if (!Number.isSafeInteger(total) || total >= 2 ** 48) throw new Error("Lottery weights exceed the supported exact integer range.");
    const ticket = draw(total);
    if (!Number.isInteger(ticket) || ticket < 0 || ticket >= total) throw new Error("Invalid lottery ticket.");
    let remainder = ticket;
    const selected = pool.findIndex(({ weight }) => { remainder -= weight; return remainder < 0; });
    const [winner] = pool.splice(selected, 1);
    winners.push(winner.teamId); draws.push({ total, ticket, teamId: winner.teamId });
  }
  return { order: [...winners, ...reversePlacement.filter((id) => !winners.includes(id))], draws };
}
