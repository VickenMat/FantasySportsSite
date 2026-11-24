import { z } from "zod";
import type { Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { fitsSlot } from "@/simulation/config";
import { leagueContext, resolveLeagueSport } from "./league";

export function teamForPick(order: readonly string[], overall: number) {
  if (!order.length || overall < 1) throw new Error("Draft order and pick number must be valid.");
  const index = overall - 1; const round = Math.floor(index / order.length); const offset = index % order.length;
  return order[round % 2 ? order.length - 1 - offset : offset];
}

export function buildPickOrder(order: readonly string[], rounds: number, retained: ReadonlyMap<string, number> = new Map()) {
  const picks: string[] = [];
  for (let round = 0; round < rounds; round++) {
    const snake = round % 2 ? [...order].reverse() : [...order];
    for (const teamId of snake) if (round < rounds - (retained.get(teamId) ?? 0)) picks.push(teamId);
  }
  return picks;
}

export async function createDraft(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const membership = await leagueContext(userId, leagueId);
  if (membership?.role !== "COMMISSIONER") throw new Error("Only the commissioner can start the draft.");
  const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const filled = membership.league.teams.length;
  if (filled !== membership.league.maxTeams) {
    const open = membership.league.maxTeams - filled;
    throw new Error(`This league has ${filled} of ${membership.league.maxTeams} team slots filled. Invite ${open} more manager${open === 1 ? "" : "s"}, reduce the league capacity to ${filled}, or add computer-controlled franchises.`);
  }
  const currentTeamIds = membership.league.teams.map(({ id }) => id);
  const configured = leagueSport.draftOrder;
  const order = configured.length === currentTeamIds.length && new Set(configured).size === currentTeamIds.length && configured.every((id) => currentTeamIds.includes(id)) ? configured : currentTeamIds;
  const retainedRows = await getDatabase().rosterEntry.groupBy({ by: ["teamId"], where: { leagueId, sport: leagueSport.sport, releasedAt: null }, _count: true });
  const retained = new Map(retainedRows.map((row) => [row.teamId, row._count]));
  const pickOrder = buildPickOrder(order, leagueSport.draftRounds, retained);
  if (!pickOrder.length) throw new Error(`${leagueSport.sport} rosters are already full for this season.`);
  const now = new Date();
  return getDatabase().$transaction(async (tx) => {
    const existing = await tx.draft.findFirst({ where: { leagueId, sport: leagueSport.sport, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } } });
    if (existing) return existing;
    await tx.league.update({ where: { id: leagueId }, data: { status: "DRAFTING" } });
    return tx.draft.create({ data: {
      leagueId, leagueSportId: leagueSport.id, sport: leagueSport.sport, status: "ACTIVE", rounds: leagueSport.draftRounds,
      seasonId: leagueSport.seasonId,
      order, pickOrder, startedAt: now, pickStartedAt: now, pickDeadlineAt: new Date(now.getTime() + leagueSport.draftSecondsPerPick * 1000), secondsPerPick: leagueSport.draftSecondsPerPick,
    } });
  }, { isolationLevel: "Serializable" });
}

export async function playerPage(leagueId: string, options: { sport?: Sport | string; search?: string; position?: string; page?: number; pageSize?: number } = {}) {
  const leagueSport = await resolveLeagueSport(leagueId, options.sport); const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 50)));
  const where = { sport: leagueSport.sport, isSynthetic: false, displayName: options.search ? { contains: options.search, mode: "insensitive" as const } : undefined,
    rosterEntries: { none: { leagueId, sport: leagueSport.sport, releasedAt: null } },
    OR: [{ isDemo: true }, { gameStats: { some: { game: { seasonId: leagueSport.seasonId }, observedPositions: options.position ? { has: options.position } : undefined } } }] };
  const database = getDatabase();
  const [players, total] = await Promise.all([database.player.findMany({ where, orderBy: [{ displayName: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize, take: pageSize, include: { gameStats: { where: { game: { seasonId: leagueSport.seasonId } }, orderBy: { recordedAt: "desc" }, take: 1, select: { observedPositions: true, team: { select: { code: true, displayName: true } } } } } }),
  database.player.count({ where })]);
  return { items: players.map((player) => ({ ...player, positions: player.gameStats[0]?.observedPositions ?? [] })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sport: leagueSport.sport };
}

export async function availablePlayers(leagueId: string, search = "", position?: string, limit = 200, sport?: Sport | string) {
  return (await playerPage(leagueId, { sport, search, position, pageSize: Math.min(100, limit) })).items;
}

type PositionedPlayer = { id: string; positions: string[] };
export function chooseAutomaticPlayer(sport: Sport, slots: readonly string[], roster: readonly PositionedPlayer[], candidates: readonly PositionedPlayer[]) {
  const unfilled = [...slots];
  for (const player of roster) {
    const slotIndex = unfilled.findIndex((slot) => fitsSlot(sport, slot, new Set(player.positions)));
    if (slotIndex >= 0) unfilled.splice(slotIndex, 1);
  }
  return candidates.find((player) => unfilled.some((slot) => fitsSlot(sport, slot, new Set(player.positions)))) ?? candidates[0] ?? null;
}

export async function automaticCandidate(draftId: string, teamId: string) {
  const database = getDatabase(); const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId }, include: { leagueSport: true } });
  const queue = await database.draftQueueEntry.findMany({ where: { draftId, teamId, player: { sport: draft.sport, rosterEntries: { none: { leagueId: draft.leagueId, sport: draft.sport, releasedAt: null } } } }, orderBy: { rank: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  const [roster, candidates] = await Promise.all([
    database.rosterEntry.findMany({ where: { leagueId: draft.leagueId, sport: draft.sport, teamId, releasedAt: null }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } }),
    availablePlayers(draft.leagueId, "", undefined, 100, draft.sport),
  ]);
  if (roster.length >= draft.leagueSport.rosterSlots.length + draft.leagueSport.benchSlots) return null;
  if (queue[0]) return queue[0].player;
  const choice = chooseAutomaticPlayer(draft.sport, draft.leagueSport.rosterSlots,
    roster.map(({ player }) => ({ id: player.id, positions: player.gameStats[0]?.observedPositions ?? [] })), candidates);
  return choice ? candidates.find(({ id }) => id === choice.id) ?? null : null;
}

export async function makePick(input: { userId?: string; draftId: string; playerId: string; automatic?: boolean; system?: boolean; now?: Date }) {
  z.uuid().parse(input.draftId); z.uuid().parse(input.playerId); const database = getDatabase();
  return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: input.draftId }, include: { leagueSport: true } });
    if (draft.status !== "ACTIVE") throw new Error("The draft is not active.");
    const teamId = draft.pickOrder[draft.currentPick - 1];
    if (!teamId) throw new Error("The draft pick order is complete.");
    const team = await tx.fantasyTeam.findUniqueOrThrow({ where: { id: teamId } });
    const member = input.userId ? await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId: input.userId } } }) : null;
    const now = input.now ?? new Date(); const deadline = draft.pickDeadlineAt ?? (draft.pickStartedAt ? new Date(draft.pickStartedAt.getTime() + draft.secondsPerPick * 1000) : null);
    const systemAuthorized = input.system === true && input.automatic === true && deadline != null && deadline <= now;
    if (!(systemAuthorized || team.managerId === input.userId || (input.automatic && member?.role === "COMMISSIONER"))) throw new Error("It is another manager's turn.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: input.playerId }, include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, select: { observedPositions: true } } } });
    if (player.sport !== draft.sport) throw new Error(`Only ${draft.sport} players are eligible for this draft.`);
    const roster = await tx.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId, leagueSportId: draft.leagueSportId } } });
    const round = Math.floor((draft.currentPick - 1) / draft.order.length) + 1; const roundPick = (draft.currentPick - 1) % draft.order.length + 1;
    const activeRoster = await tx.rosterEntry.findMany({ where: { rosterId: roster.id, releasedAt: null }, select: { slot: true } });
    const maximum = draft.leagueSport.rosterSlots.length + draft.leagueSport.benchSlots;
    if (activeRoster.length >= maximum) throw new Error("This sport roster is full.");
    const positions = new Set(player.gameStats[0]?.observedPositions ?? []); const occupied = new Map<string, number>();
    for (const entry of activeRoster) occupied.set(entry.slot, (occupied.get(entry.slot) ?? 0) + 1);
    const slot = draft.leagueSport.rosterSlots.find((candidate) => fitsSlot(draft.sport, candidate, positions) && (occupied.get(candidate) ?? 0) < draft.leagueSport.rosterSlots.filter((value) => value === candidate).length) ?? "BENCH";
    const pick = await tx.draftPick.create({ data: { draftId: draft.id, teamId, playerId: player.id, overall: draft.currentPick, round, roundPick, automatic: input.automatic ?? false } });
    await tx.rosterEntry.create({ data: { leagueId: draft.leagueId, teamId, rosterId: roster.id, playerId: player.id, sport: draft.sport, seasonId: draft.leagueSport.seasonId, slot } });
    await tx.fantasyTransaction.create({ data: { leagueId: draft.leagueId, leagueSportId: draft.leagueSportId, rosterId: roster.id, sport: draft.sport, teamId, playerId: player.id, type: "DRAFT", note: `Drafted ${round}.${roundPick}` } });
    const complete = draft.currentPick >= draft.pickOrder.length;
    await tx.draft.update({ where: { id: draft.id }, data: complete ? { status: "COMPLETE", completedAt: now, pickDeadlineAt: null, pausedRemainingMs: null } : { currentPick: { increment: 1 }, pickStartedAt: now, pickDeadlineAt: new Date(now.getTime() + draft.secondsPerPick * 1000), pausedRemainingMs: null, version: { increment: 1 } } });
    await tx.draftQueueEntry.deleteMany({ where: { draftId: draft.id, playerId: player.id } });
    if (complete && await tx.draft.count({ where: { leagueId: draft.leagueId, id: { not: draft.id }, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } } }) === 0) {
      await tx.league.update({ where: { id: draft.leagueId }, data: { status: "ACTIVE" } });
    }
    return pick;
  }, { isolationLevel: "Serializable" });
}

export async function autoPick(userId: string, draftId: string) {
  const draft = await getDatabase().draft.findUniqueOrThrow({ where: { id: draftId } }); const teamId = draft.pickOrder[draft.currentPick - 1];
  const candidate = await automaticCandidate(draftId, teamId);
  if (!candidate) throw new Error(`No available ${draft.sport} players remain.`);
  return makePick({ userId, draftId, playerId: candidate.id, automatic: true });
}

export async function autoPickExpiredDraft(draftId: string, now = new Date()) {
  const draft = await getDatabase().draft.findUniqueOrThrow({ where: { id: draftId } });
  const deadline = draft.pickDeadlineAt ?? (draft.pickStartedAt ? new Date(draft.pickStartedAt.getTime() + draft.secondsPerPick * 1000) : null);
  if (draft.status !== "ACTIVE" || !deadline || deadline > now) return null;
  const teamId = draft.pickOrder[draft.currentPick - 1];
  const fallback = await automaticCandidate(draftId, teamId);
  if (!fallback) throw new Error(`No available ${draft.sport} player remains for the automatic pick.`);
  return makePick({ draftId, playerId: fallback.id, automatic: true, system: true, now });
}

export async function setDraftPaused(userId: string, draftId: string, paused: boolean) {
  const database = getDatabase(); return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can pause or resume the draft.");
    if (paused && draft.status !== "ACTIVE") throw new Error("Only an active draft can be paused.");
    if (!paused && draft.status !== "PAUSED") throw new Error("Only a paused draft can be resumed.");
    const now = new Date();
    if (paused) {
      const deadline = draft.pickDeadlineAt ?? new Date((draft.pickStartedAt?.getTime() ?? now.getTime()) + draft.secondsPerPick * 1000);
      const remaining = Math.max(0, deadline.getTime() - now.getTime());
      return tx.draft.update({ where: { id: draftId }, data: { status: "PAUSED", pausedAt: now, pausedRemainingMs: remaining, pickDeadlineAt: null, version: { increment: 1 } } });
    }
    const remaining = Math.max(0, draft.pausedRemainingMs ?? draft.secondsPerPick * 1000);
    return tx.draft.update({ where: { id: draftId }, data: { status: "ACTIVE", pausedAt: null, pausedRemainingMs: null, pickStartedAt: now, pickDeadlineAt: new Date(now.getTime() + remaining), version: { increment: 1 } } });
  }, { isolationLevel: "Serializable" });
}

export async function queuePlayer(userId: string, draftId: string, playerId: string) {
  const database = getDatabase(); const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId } });
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  const player = await database.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.sport !== draft.sport) throw new Error(`Only ${draft.sport} players can be queued here.`);
  const rank = await database.draftQueueEntry.count({ where: { draftId, teamId: membership.fantasyTeam.id } }) + 1;
  return database.draftQueueEntry.upsert({ where: { draftId_teamId_playerId: { draftId, teamId: membership.fantasyTeam.id, playerId } }, update: {}, create: { draftId, teamId: membership.fantasyTeam.id, playerId, rank } });
}

export async function changeQueue(userId: string, draftId: string, entryId: string, operation: "UP" | "DOWN" | "REMOVE") {
  const database = getDatabase(); return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    if (!["ACTIVE", "PAUSED"].includes(draft.status)) throw new Error("This draft queue is closed.");
    const membership = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } }, include: { fantasyTeam: true } });
    if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
    const entry = await tx.draftQueueEntry.findFirst({ where: { id: entryId, draftId, teamId: membership.fantasyTeam.id } });
    if (!entry) throw new Error("That private queue entry is unavailable.");
    if (operation === "REMOVE") {
      await tx.draftQueueEntry.delete({ where: { id: entry.id } });
    } else {
      const neighbor = await tx.draftQueueEntry.findFirst({ where: { draftId, teamId: entry.teamId, rank: operation === "UP" ? { lt: entry.rank } : { gt: entry.rank } }, orderBy: { rank: operation === "UP" ? "desc" : "asc" } });
      if (neighbor) {
        await tx.draftQueueEntry.update({ where: { id: entry.id }, data: { rank: -1 } });
        await tx.draftQueueEntry.update({ where: { id: neighbor.id }, data: { rank: entry.rank } });
        await tx.draftQueueEntry.update({ where: { id: entry.id }, data: { rank: neighbor.rank } });
      }
    }
    const queue = await tx.draftQueueEntry.findMany({ where: { draftId, teamId: entry.teamId }, orderBy: { rank: "asc" } });
    for (let index = 0; index < queue.length; index++) if (queue[index].rank !== index + 1) await tx.draftQueueEntry.update({ where: { id: queue[index].id }, data: { rank: index + 1 } });
    return queue.length;
  }, { isolationLevel: "Serializable" });
}

export async function reorderQueue(userId: string, draftId: string, entryIds: string[]) {
  const orderedIds = z.array(z.uuid()).max(250).parse(entryIds);
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error("Queue entries must be unique.");
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    if (!["ACTIVE", "PAUSED"].includes(draft.status)) throw new Error("This draft queue is closed.");
    const membership = await tx.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: draft.leagueId, userId } },
      include: { fantasyTeam: true },
    });
    if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
    const queue = await tx.draftQueueEntry.findMany({
      where: { draftId, teamId: membership.fantasyTeam.id },
      orderBy: { rank: "asc" },
      select: { id: true },
    });
    const currentIds = queue.map(({ id }) => id);
    if (orderedIds.length !== currentIds.length || orderedIds.some((id) => !currentIds.includes(id))) {
      throw new Error("The private queue changed. Refresh before reordering it.");
    }
    // Clear the unique (draft, team, rank) range before assigning final ranks.
    for (let index = 0; index < orderedIds.length; index++) {
      await tx.draftQueueEntry.update({ where: { id: orderedIds[index] }, data: { rank: -(index + 1) } });
    }
    for (let index = 0; index < orderedIds.length; index++) {
      await tx.draftQueueEntry.update({ where: { id: orderedIds[index] }, data: { rank: index + 1 } });
    }
    return orderedIds.length;
  }, { isolationLevel: "Serializable" });
}

export async function processExpiredDrafts(now = new Date()) {
  const drafts = await getDatabase().draft.findMany({ where: { status: "ACTIVE", OR: [{ pickDeadlineAt: { lte: now } }, { pickDeadlineAt: null, pickStartedAt: { not: null } }] }, select: { id: true } });
  let picked = 0;
  for (const draft of drafts) {
    try { if (await autoPickExpiredDraft(draft.id, now)) picked++; } catch (error) {
      if (!(error instanceof Error) || !/transaction|unique|another manager|not active/i.test(error.message)) throw error;
    }
  }
  return picked;
}

export function playerFitsRoster(sport: Sport, slot: string, positions: string[]) { return fitsSlot(sport, slot, new Set(positions)); }
