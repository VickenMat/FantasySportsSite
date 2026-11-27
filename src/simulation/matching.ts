import { compareId } from "./config";

export function augment(
  assigned: (string | undefined)[],
  owners: Map<string, number>,
  legal: readonly (readonly string[])[],
  seat: number,
  blockedSeat = -1,
  blockedPlayer?: string,
  visited = new Set<string>(),
): boolean {
  for (const player of legal[seat]) {
    if (player === blockedPlayer || visited.has(player)) continue;
    visited.add(player);
    const occupied = owners.get(player);
    if (occupied === blockedSeat) continue;
    if (occupied === undefined || augment(assigned, owners, legal, occupied, blockedSeat, blockedPlayer, visited)) {
      assigned[seat] = player;
      owners.set(player, seat);
      return true;
    }
  }
  return false;
}

export function legalCoverage(legal: readonly (readonly string[])[]) {
  const assigned = Array<string | undefined>(legal.length).fill(undefined);
  const owners = new Map<string, number>();
  const order = legal.map((_, seat) => seat).sort((a, b) => legal[a].length - legal[b].length || a - b);
  for (const seat of order) augment(assigned, owners, legal, seat);
  return { assigned, owners };
}

export type Edge<T> = { playerId: string; projection: number; selection: T };

// Hungarian assignment with a private pool of empty columns. First maximize
// legal fills, then projected value. Sorted IDs make ties independent of input order.
export function assignLineup<T>(edges: readonly (readonly Edge<T>[])[], maximizeFilled = true) {
  const count = edges.length;
  const candidates = [...new Set(edges.flatMap((list) => list.map(({ playerId }) => playerId)))].sort(compareId);
  const columns = candidates.length + count;
  const cells = edges.map((list) => new Map(list.map((edge) => [edge.playerId, edge])));
  const maxValue = edges.reduce((max, list) =>
    list.reduce((largest, edge) => Math.max(largest, Math.abs(edge.projection)), max), 1);
  const forbiddenCost = (2 * count + 1) * maxValue;
  const fillBonus = maximizeFilled ? forbiddenCost : 0;
  const cost = (i: number, j: number) => {
    if (j > candidates.length) return 0;
    const edge = cells[i - 1].get(candidates[j - 1]);
    return edge ? -fillBonus - edge.projection : forbiddenCost;
  };

  const u = new Array<number>(count + 1).fill(0);
  const v = new Array<number>(columns + 1).fill(0);
  const p = new Array<number>(columns + 1).fill(0);
  const path = new Array<number>(columns + 1).fill(0);
  for (let i = 1; i <= count; i++) {
    p[0] = i;
    const min = new Array<number>(columns + 1).fill(Infinity);
    const used = new Array<boolean>(columns + 1).fill(false);
    let current = 0;
    do {
      used[current] = true;
      const row = p[current];
      let delta = Infinity;
      let next = 0;
      for (let j = 1; j <= columns; j++) {
        if (used[j]) continue;
        const reduced = cost(row, j) - u[row] - v[j];
        if (reduced < min[j]) {
          min[j] = reduced;
          path[j] = current;
        }
        if (min[j] < delta) {
          delta = min[j];
          next = j;
        }
      }
      for (let j = 0; j <= columns; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          min[j] -= delta;
        }
      }
      current = next;
    } while (p[current] !== 0);

    do {
      const previous = path[current];
      p[current] = p[previous];
      current = previous;
    } while (current !== 0);
  }

  const assignments = Array<Edge<T> | undefined>(count).fill(undefined);
  for (let j = 1; j <= candidates.length; j++) {
    if (p[j]) assignments[p[j] - 1] = cells[p[j] - 1].get(candidates[j - 1]);
  }
  return assignments;
}
