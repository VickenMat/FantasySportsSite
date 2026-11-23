import { augment, legalCoverage } from "./matching";
import { compareId, seededRandom, type SimulationConfig } from "./config";

export type Candidate = { id: string; value: number; legal: readonly number[] };
export type DraftPick = { team: number; round: number; playerId: string; seat: number | null; value: number };

export function runDraft(candidates: readonly Candidate[], config: SimulationConfig) {
  const { slots, teams, bench, seed, strategy } = config;
  const random = seededRandom(seed);
  const perSlot = slots.map((_, index) => candidates.filter(({ legal }) => legal.includes(index)).length);
  const ranked = [...candidates].sort((a, b) => compareId(a.id, b.id)).map((candidate) => {
    const scarcity = candidate.legal.reduce((smallest, i) => Math.min(smallest, perSlot[i]), Infinity);
    const adjustment = strategy === "scarcity" && Number.isFinite(scarcity) ? 1000 / scarcity : 0;
    return { ...candidate, rank: candidate.value + adjustment, tie: random() };
  }).sort((a, b) => b.rank - a.rank || a.tie - b.tie || compareId(a.id, b.id));
  const available = new Set(ranked.map(({ id }) => id));
  const bySlot = slots.map((_, i) => ranked.filter(({ legal }) => legal.includes(i)).map(({ id }) => id));
  const legal = Array.from({ length: teams * slots.length }, (_, i) => bySlot[i % slots.length]);
  let { assigned, owners } = legalCoverage(legal);
  const achievableStarts = owners.size;
  const draftedSeats = new Set<number>();
  const picks: DraftPick[] = [];

  function reserve(seat: number, id: string) {
    const oldOwner = owners.get(id);
    const formerPlayer = assigned[seat];
    if (oldOwner !== seat && oldOwner !== undefined && formerPlayer !== undefined) {
      const trial = [...assigned];
      const trialOwners = new Map(owners);
      trial[oldOwner] = undefined;
      trial[seat] = undefined;
      trialOwners.delete(formerPlayer);
      trialOwners.delete(id);
      // Drafted players and earlier seats are removed from the legal pool.
      if (!augment(trial, trialOwners, legal, oldOwner, seat, id, new Set(drafted))) return false;
      assigned = trial;
      owners = trialOwners;
    } else {
      if (oldOwner !== undefined) assigned[oldOwner] = undefined;
      if (formerPlayer) owners.delete(formerPlayer);
      owners.delete(id);
    }
    draftedSeats.add(seat);
    return true;
  }

  const drafted = new Set<string>();
  const order = Array.from({ length: teams }, (_, team) => team);
  for (let round = 0; round < slots.length + bench; round++) {
    const snake = round % 2 ? [...order].reverse() : order;
    for (const team of snake) {
      if (round >= slots.length) {
        const player = ranked.find(({ id, legal }) => available.has(id) && legal.length > 0);
        if (player) {
          available.delete(player.id);
          picks.push({ team, round: round + 1, playerId: player.id, seat: null, value: player.value });
        }
        continue;
      }
      const seatOrder = slots.map((_, index) => team * slots.length + index)
        .filter((index) => !draftedSeats.has(index))
        .sort((a, b) => legal[a].length - legal[b].length || a - b);
      for (const player of ranked) {
        if (!available.has(player.id)) continue;
        const seat = seatOrder.find((seat) => player.legal.includes(seat % slots.length) && reserve(seat, player.id));
        if (seat === undefined) continue;
        available.delete(player.id);
        drafted.add(player.id);
        picks.push({ team, round: round + 1, playerId: player.id, seat: seat % slots.length, value: player.value });
        break;
      }
    }
  }
  return { picks, achievableStarts, unfilledStarterSeats: teams * slots.length - draftedSeats.size };
}
