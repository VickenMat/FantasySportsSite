import { calculateEligibility, type PositionEvidence } from "@/positions/eligibility";
import { engineVersion as scoringEngineVersion } from "@/scoring/engine";
import { ubpV9 } from "@/scoring/ubp-v9";
import { compareId, day, fitsSlot, slotRule, type ScoringRole, type SimulationConfig } from "./config";
import { runDraft, type Candidate } from "./draft";
import { assignLineup, legalCoverage } from "./matching";
import type { Availability, Fixture, Outcome, RosterSnapshot, SimulationInput } from "./types";

export const simulationVersion = "historical-fantasy-1";
const historyLimit = 20;

type Player = {
  id: string;
  results: Map<ScoringRole, Outcome[]>;
  roster?: RosterSnapshot;
  lastTeamResult?: Outcome;
  lastPositionResult?: Outcome;
  priorPositions?: { year: number; codes: Set<string> };
  lastPitchingStart?: Outcome;
};
type Team = { roster: Set<string>; budget: number; claimsWon: number; total: number };
type Selection = { role: ScoringRole; games: string[]; uncertain: boolean };
type Picked = Selection & { team: number; playerId: string; slot: string; slotIndex: number; lockAt: number; projection: number };
type Waiver = { at: number; team: number; add: string; drop: string | null; bid: number; won: boolean };

const eventOrder = (a: Outcome, b: Outcome) =>
  a.knownAt - b.knownAt || a.playedAt - b.playedAt || compareId(a.gameId, b.gameId) ||
  compareId(a.playerId, b.playerId) || compareId(a.role, b.role);
const resultKey = (gameId: string, playerId: string, role: ScoringRole) => JSON.stringify([gameId, playerId, role]);

function profileValue(player: Player, role: ScoringRole, strategy: SimulationConfig["strategy"], playedBefore = Infinity) {
  const past = player.results.get(role)?.filter(({ playedAt }) => playedAt < playedBefore).slice(-historyLimit);
  if (!past?.length) return 0;
  const values = past.map((event) => event.pointsTenths);
  if (strategy === "upside") {
    values.sort((a, b) => a - b);
    return values[Math.floor((values.length - 1) * 0.75)];
  }
  // Shrink short samples toward zero instead of treating a single game as a full projection.
  return values.reduce((sum, value) => sum + value, 0) / Math.max(4, values.length);
}

function weeklyDeadlines(input: SimulationInput, config: SimulationConfig) {
  const last = input.fixtures.reduce((max, fixture) => Math.max(max, fixture.startsAt), input.draftAt);
  let first = Math.floor(input.draftAt / day) * day + config.waiverHourUtc * 3_600_000;
  first += ((config.waiverWeekday - new Date(first).getUTCDay() + 7) % 7) * day;
  if (first <= input.draftAt) first += 7 * day;
  const deadlines: number[] = [];
  for (let time = first; time <= last; time += 7 * day) deadlines.push(time);
  return deadlines;
}

type Slate = { lockAt: number; fixtures: Fixture[] };

function createSlates(fixtures: readonly Fixture[]) {
  const slates = new Map<string, Slate>();
  for (const fixture of fixtures) {
    const existing = slates.get(fixture.slate);
    if (existing) {
      existing.lockAt = Math.min(existing.lockAt, fixture.startsAt);
      existing.fixtures.push(fixture);
    } else {
      slates.set(fixture.slate, { lockAt: fixture.startsAt, fixtures: [fixture] });
    }
  }
  return [...slates.values()].sort((a, b) => a.lockAt - b.lockAt || compareId(a.fixtures[0].slate, b.fixtures[0].slate));
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function simulateSeason(input: SimulationInput, config: SimulationConfig) {
  if (input.sport !== config.sport) throw new Error("Simulation sport and data sport differ.");
  const { sport, slots } = config;
  const proxy = input.mode === "historical-proxy";
  const profiles = new Map<string, Player>();
  function profile(id: string) {
    const current = profiles.get(id);
    if (current) return current;
    const created: Player = { id, results: new Map() };
    profiles.set(id, created);
    return created;
  }

  const outcomes = [...input.outcomes].sort(eventOrder);
  const roster = [...input.roster].sort((a, b) =>
    Math.max(a.knownAt, a.effectiveAt) - Math.max(b.knownAt, b.effectiveAt) ||
    a.effectiveAt - b.effectiveAt || a.knownAt - b.knownAt || compareId(a.playerId, b.playerId));
  const availability = [...input.availability].sort((a, b) => a.knownAt - b.knownAt);
  const available = new Map<string, Availability>();
  const evidence = new Map<string, PositionEvidence[]>();
  for (const entry of input.positions) {
    const entries = evidence.get(entry.playerId) ?? [];
    entries.push(entry);
    evidence.set(entry.playerId, entries);
  }
  let nextResult = 0;
  let nextRoster = 0;
  let nextAvailability = 0;

  function advance(cutoff: number) {
    // Publication, not fixture time, determines the point at which a box score can inform decisions.
    while (nextResult < outcomes.length && outcomes[nextResult].knownAt < cutoff) {
      const event = outcomes[nextResult++];
      if (event.playedAt >= cutoff) throw new Error("An outcome has an impossible publication timestamp.");
      const player = profile(event.playerId);
      const past = player.results.get(event.role) ?? [];
      past.push(event);
      const publicationDay = Math.floor(event.knownAt / day) * day;
      const earlier = past.filter(({ playedAt }) => playedAt < publicationDay);
      if (earlier.length > historyLimit) past.splice(past.indexOf(earlier[0]), 1);
      player.results.set(event.role, past);
      if (event.role === "PITCHER" && event.started && (player.lastPitchingStart?.playedAt ?? -Infinity) < event.playedAt) {
        player.lastPitchingStart = event;
      }
      if (proxy && event.observedTeam && (player.lastTeamResult?.playedAt ?? -Infinity) <= event.playedAt) {
        player.lastTeamResult = event;
      }
      if (proxy && event.observedPositions?.length) {
        if ((player.lastPositionResult?.playedAt ?? -Infinity) <= event.playedAt) player.lastPositionResult = event;
        if (event.seasonYear < input.year) {
          if (!player.priorPositions || event.seasonYear > player.priorPositions.year) {
            player.priorPositions = { year: event.seasonYear, codes: new Set() };
          }
          if (event.seasonYear === player.priorPositions.year) {
            for (const code of event.observedPositions) player.priorPositions.codes.add(code);
          }
        }
      }
    }
    while (nextRoster < roster.length && Math.max(roster[nextRoster].knownAt, roster[nextRoster].effectiveAt) < cutoff) {
      const fact = roster[nextRoster++];
      const player = profile(fact.playerId);
      if (!player.roster || fact.effectiveAt >= player.roster.effectiveAt) player.roster = fact;
    }
    while (nextAvailability < availability.length && availability[nextAvailability].knownAt < cutoff) {
      const status = availability[nextAvailability++];
      available.set(resultKey(status.gameId, status.playerId, status.role), status);
    }
  }

  function positions(player: Player, at: number) {
    if (proxy) {
      // MLB/NBA list enrichment can incorporate an entire season. Only prior-season lists may be used.
      if (sport === "MLB" || sport === "NBA") {
        return player.priorPositions?.year === input.year - 1 ? player.priorPositions.codes : new Set<string>();
      }
      return new Set(player.lastPositionResult?.observedPositions);
    }
    const listed = new Set(player.roster?.positions);
    const history = evidence.get(player.id);
    if (history) {
      for (const position of calculateEligibility({
        sport, seasonYear: input.year, asOf: new Date(at - 1), evidence: history,
      }).positions) listed.add(position);
    }
    return listed;
  }

  function proTeam(player: Player) {
    if (proxy) return player.lastTeamResult?.observedTeam;
    return player.roster?.active ? player.roster.team : null;
  }

  function draftPool(at: number, playedBefore = Infinity) {
    return [...profiles.values()].flatMap((player): Candidate[] => {
      if (!proTeam(player)) return [];
      if (proxy && (player.lastTeamResult?.seasonYear ?? 0) < input.year - 1) return [];
      const knownPositions = positions(player, at);
      const legal = slots.flatMap((slot, index) => fitsSlot(sport, slot, knownPositions) ? [index] : []);
      if (!legal.length) return [];
      return [{
        id: player.id, legal,
        value: Math.max(...legal.map((index) => profileValue(player, slotRule(sport, slots[index]).role, config.strategy, playedBefore))),
      }];
    });
  }

  advance(input.draftAt);
  const draft = runDraft(draftPool(input.draftAt), config);
  const ownership = new Set(draft.picks.map(({ playerId }) => playerId));
  const teams: Team[] = Array.from({ length: config.teams }, () =>
    ({ roster: new Set(), budget: config.faab, claimsWon: 0, total: 0 }));
  for (const pick of draft.picks) teams[pick.team].roster.add(pick.playerId);

  const waivers: Waiver[] = [];
  let waiverWindows = 0;
  function processWaivers(at: number) {
    waiverWindows++;
    const pool = draftPool(at, Math.floor(at / day) * day);
    const profilesById = new Map(pool.map((player) => [player.id, player]));
    const free = pool.filter(({ id }) => !ownership.has(id))
      .sort((a, b) => b.value - a.value || compareId(a.id, b.id));
    const bids: Waiver[] = [];
    function coverage(players: readonly Candidate[]) {
      return legalCoverage(slots.map((_, i) => players.filter(({ legal }) => legal.includes(i)).map(({ id }) => id))).owners.size;
    }
    for (const [index, team] of teams.entries()) {
      const incumbents = [...team.roster].map((id): Candidate => profilesById.get(id) ?? { id, value: 0, legal: [] })
        .sort((a, b) => a.value - b.value || compareId(a.id, b.id));
      const before = coverage(incumbents);
      const drops: (Candidate | null)[] = team.roster.size < slots.length + config.bench ? [null] : incumbents;
      // Consider replacements against all eligible players, including scarce positions.
      let claim: Waiver | undefined;
      for (const added of free) {
        if (before === slots.length && drops[0] && added.value <= drops[0].value) break;
        for (const dropped of drops) {
          const gain = added.value - (dropped?.value ?? 0);
          if (before === slots.length && dropped && gain <= 0) continue;
          const after = coverage([...incumbents.filter(({ id }) => id !== dropped?.id), added]);
          if (after < before || (after === before && dropped && gain <= 0)) continue;
          claim = {
            at, team: index, add: added.id, drop: dropped?.id ?? null,
            bid: Math.min(team.budget, Math.max(0, Math.ceil(gain / 10))), won: false,
          };
          break;
        }
        if (claim) break;
      }
      if (claim) bids.push(claim);
    }
    const priority = (team: number) => (team - (waiverWindows - 1) % config.teams + config.teams) % config.teams;
    bids.sort((a, b) => b.bid - a.bid || teams[a.team].claimsWon - teams[b.team].claimsWon || priority(a.team) - priority(b.team));
    const awarded = new Set<string>();
    for (const bid of bids) {
      const team = teams[bid.team];
      if (!awarded.has(bid.add) && bid.bid <= team.budget) {
        if (bid.drop) {
          team.roster.delete(bid.drop);
          ownership.delete(bid.drop);
        }
        team.roster.add(bid.add);
        ownership.add(bid.add);
        team.budget -= bid.bid;
        team.claimsWon++;
        bid.won = true;
        awarded.add(bid.add);
      }
      waivers.push(bid);
    }
  }

  function probability(player: Player, fixture: Fixture, role: ScoringRole, slot: string, at: number) {
    const status = available.get(resultKey(fixture.id, player.id, role));
    if (status) {
      if (role === "PITCHER" && ((slot === "SP" && status.usage !== "starter") || (slot === "RP" && status.usage !== "relief"))) return null;
      return status.probability;
    }
    if (role !== "PITCHER" && role !== "GOALIE") return proxy ? 0.85 : 1;
    if (!proxy) return null;
    const past = player.results.get(role)?.slice(-historyLimit) ?? [];
    if (!past.length) return null;
    const starts = past.filter((event) => event.started === true).length;
    if (role === "GOALIE") return Math.min(0.85, (starts + 1) / (past.length + 2));
    const sinceStart = at - (player.lastPitchingStart?.playedAt ?? -Infinity);
    const starterProbability = starts && sinceStart >= 4 * day ? Math.min(0.55, 0.2 + (sinceStart / day - 4) * 0.07) : 0;
    if (slot === "SP") return starterProbability;
    const relief = past.filter((event) => event.started === false).length;
    const reliefProbability = relief ? Math.min(0.35, relief / (past.length * 2)) : 0;
    return slot === "RP" ? reliefProbability : Math.max(starterProbability, reliefProbability);
  }

  let requestedSlots = 0;
  let filledSlots = 0;
  let uncertainAssignments = 0;
  const vacancies = { eligibility: 0, schedule: 0, availability: 0, assignmentConflict: 0 };
  const countsBySlot: Record<string, { requested: number; filled: number; earnedTenths: number }> = {};
  const picks: Picked[] = [];
  const deadlines = weeklyDeadlines(input, config);
  const slates = createSlates(input.fixtures);
  let week = 0;
  for (const slate of slates) {
    const at = slate.lockAt;
    const slateDay = Math.floor(at / day) * day;
    if (at <= input.draftAt) throw new Error("A simulation fixture starts before the draft.");
    while (week < deadlines.length && deadlines[week] < at) {
      const deadline = deadlines[week++];
      advance(deadline);
      processWaivers(deadline);
    }
    advance(at);
    const scheduled = new Map<string, Fixture[]>();
    for (const game of slate.fixtures) {
      if (game.knownAt >= at) continue;
      for (const team of game.teams) {
        const games = scheduled.get(team) ?? [];
        games.push(game);
        scheduled.set(team, games);
      }
    }
    for (const [teamIndex, team] of teams.entries()) {
      const squad = [...team.roster].map((id) => profile(id)).map((player) => ({
        player, positions: positions(player, at), games: [...scheduled.get(proTeam(player) ?? "") ?? []],
      }));
      const failures: (keyof typeof vacancies)[] = [];
      const edges = slots.map((slot, index) => {
        const { role } = slotRule(sport, slot);
        const eligible = squad.filter((entry) => fitsSlot(sport, slot, entry.positions));
        const onSlate = eligible.filter(({ games }) => games.length);
        const edges = onSlate.flatMap(({ player, games }) => {
          let projected = 0;
          const playable: string[] = [];
          let uncertain = false;
          for (const game of games) {
            const chance = probability(player, game, role, slot, at);
            if (chance == null || chance <= 0) continue;
            playable.push(game.id);
            projected += profileValue(player, role, config.strategy, slateDay) * chance;
            uncertain ||= chance < 1;
          }
          return playable.length ? [{
            playerId: player.id, projection: projected, selection: { role, games: playable.sort(compareId), uncertain },
          }] : [];
        });
        failures[index] = !eligible.length ? "eligibility" : !onSlate.length ? "schedule" : !edges.length ? "availability" : "assignmentConflict";
        return edges;
      });
      const lineup = assignLineup<Selection>(edges);
      for (const [slotIndex, selection] of lineup.entries()) {
        const slot = slots[slotIndex];
        const counts = countsBySlot[slot] ??= { requested: 0, filled: 0, earnedTenths: 0 };
        requestedSlots++;
        counts.requested++;
        if (!selection) {
          vacancies[failures[slotIndex]]++;
          continue;
        }
        const { playerId, projection } = selection;
        filledSlots++;
        counts.filled++;
        if (selection.selection.uncertain) uncertainAssignments++;
        picks.push({ ...selection.selection, projection, team: teamIndex, playerId, slot, slotIndex, lockAt: at });
      }
    }
  }
  while (week < deadlines.length) {
    const deadline = deadlines[week++];
    advance(deadline);
    processWaivers(deadline);
  }

  // Outcomes enter settlement only through locked assignments. The decision loop
  // never reads this lookup, including actual same-game roles and late activity.
  const fixtureIds = new Set(input.fixtures.map(({ id }) => id));
  const results = new Map(outcomes.filter(({ seasonYear, gameId }) => seasonYear === input.year && fixtureIds.has(gameId))
    .map((outcome) => [resultKey(outcome.gameId, outcome.playerId, outcome.role), outcome]));
  const missingStats: Record<string, number> = {};
  const roleTotals: Partial<Record<ScoringRole, number>> = {};
  let quarterbackTenths = 0;
  let scoredStarts = 0;
  let unscoredStarts = 0;
  let negativeStarts = 0;
  const scoreTrace: { team: number; gameId: string; playerId: string; role: ScoringRole; pointsTenths: number | null }[] = [];
  const settled = new Set<string>();
  for (const pick of picks) {
    for (const gameId of pick.games) {
      const identity = JSON.stringify([pick.playerId, gameId]);
      if (settled.has(identity)) continue;
      settled.add(identity);
      const result = results.get(resultKey(gameId, pick.playerId, pick.role));
      if (config.includeTrace) {
        scoreTrace.push({ team: pick.team, gameId, playerId: pick.playerId, role: pick.role, pointsTenths: result?.pointsTenths ?? null });
      }
      if (!result) {
        unscoredStarts++;
        continue;
      }
      scoredStarts++;
      if (result.pointsTenths < 0) negativeStarts++;
      teams[pick.team].total += result.pointsTenths;
      countsBySlot[pick.slot].earnedTenths += result.pointsTenths;
      roleTotals[pick.role] = (roleTotals[pick.role] ?? 0) + result.pointsTenths;
      if (pick.slot === "QB" || (sport === "NFL" && result.observedPositions?.includes("QB"))) quarterbackTenths += result.pointsTenths;
      for (const key of result.missingStats) missingStats[key] = (missingStats[key] ?? 0) + 1;
    }
  }
  const distribution = teams.map(({ total }) => total).sort((a, b) => a - b);
  const midpoint = Math.floor(distribution.length / 2);
  const medianTenths = distribution.length % 2 ? distribution[midpoint] : average(distribution.slice(midpoint - 1, midpoint + 1));
  return {
    simulationVersion,
    scoringVersion: ubpV9.version,
    scoringEngineVersion,
    sport, year: input.year, season: input.label, coverage: input.coverage, coverageReason: input.coverageReason,
    mode: input.mode, config, draftAt: input.draftAt, source: input.source,
    metrics: {
      fixtures: input.fixtures.length, slates: slates.length,
      drafts: draft.picks.length, draftUnfilledStarterSeats: draft.unfilledStarterSeats,
      draftAchievableStarterSeats: draft.achievableStarts, medianTenths, meanTenths: average(distribution),
      requestedSlots, filledSlots, uncertainAssignments, vacancies, scoredStarts, unscoredStarts, negativeStarts,
      waiverWindows, waiverClaims: waivers.length, waiversWon: waivers.filter(({ won }) => won).length,
      slots: countsBySlot, missingStats, roleTotals, quarterbackTenths,
      teams: teams.map(({ roster, total, budget }, index) => ({ team: index, totalTenths: total, remainingFaab: budget, finalRosterSize: roster.size })),
    },
    trace: config.includeTrace ? { draft: draft.picks, lineups: picks, waivers, scores: scoreTrace } : undefined,
  };
}
