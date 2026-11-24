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
  return getDatabase().$transaction(async (tx) => {
    const existing = await tx.draft.findFirst({ where: { leagueId, sport: leagueSport.sport, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } } });
    if (existing) return existing;
    await tx.league.update({ where: { id: leagueId }, data: { status: "DRAFTING" } });
    return tx.draft.create({ data: {
      leagueId, leagueSportId: leagueSport.id, sport: leagueSport.sport, status: "ACTIVE", rounds: leagueSport.draftRounds,
      seasonId: leagueSport.seasonId,
      order, pickOrder, startedAt: new Date(), pickStartedAt: new Date(), secondsPerPick: leagueSport.draftSecondsPerPick,
    } });
  }, { isolationLevel: "Serializable" });
}

export async function playerPage(leagueId: string, options: { sport?: Sport | string; search?: string; position?: string; page?: number; pageSize?: number } = {}) {
  const leagueSport = await resolveLeagueSport(leagueId, options.sport); const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 50)));
  const where = { sport: leagueSport.sport, displayName: options.search ? { contains: options.search, mode: "insensitive" as const } : undefined,
    rosterEntries: { none: { leagueId, sport: leagueSport.sport, releasedAt: null } }, gameStats: options.position ? { some: { observedPositions: { has: options.position } } } : undefined };
  const database = getDatabase();
  const [players, total] = await Promise.all([database.player.findMany({ where, orderBy: [{ displayName: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize, take: pageSize, include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, select: { observedPositions: true } } } }),
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

async function automaticCandidate(draftId: string, teamId: string) {
  const database = getDatabase(); const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId }, include: { leagueSport: true } });
  const queue = await database.draftQueueEntry.findMany({ where: { draftId, teamId, player: { sport: draft.sport, rosterEntries: { none: { leagueId: draft.leagueId, sport: draft.sport, releasedAt: null } } } }, orderBy: { rank: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  if (queue[0]) return queue[0].player;
  const [roster, candidates] = await Promise.all([
    database.rosterEntry.findMany({ where: { leagueId: draft.leagueId, sport: draft.sport, teamId, releasedAt: null }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } }),
    availablePlayers(draft.leagueId, "", undefined, 100, draft.sport),
  ]);
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
    const now = input.now ?? new Date(); const deadline = draft.pickStartedAt ? new Date(draft.pickStartedAt.getTime() + draft.secondsPerPick * 1000) : null;
    const systemAuthorized = input.system === true && input.automatic === true && deadline != null && deadline <= now;
    if (!(systemAuthorized || team.managerId === input.userId || (input.automatic && member?.role === "COMMISSIONER"))) throw new Error("It is another manager's turn.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: input.playerId } });
    if (player.sport !== draft.sport) throw new Error(`Only ${draft.sport} players are eligible for this draft.`);
    const roster = await tx.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId, leagueSportId: draft.leagueSportId } } });
    const round = Math.floor((draft.currentPick - 1) / draft.order.length) + 1; const roundPick = (draft.currentPick - 1) % draft.order.length + 1;
    const pick = await tx.draftPick.create({ data: { draftId: draft.id, teamId, playerId: player.id, overall: draft.currentPick, round, roundPick, automatic: input.automatic ?? false } });
    await tx.rosterEntry.create({ data: { leagueId: draft.leagueId, teamId, rosterId: roster.id, playerId: player.id, sport: draft.sport, seasonId: draft.leagueSport.seasonId, slot: "BENCH" } });
    await tx.fantasyTransaction.create({ data: { leagueId: draft.leagueId, leagueSportId: draft.leagueSportId, rosterId: roster.id, sport: draft.sport, teamId, playerId: player.id, type: "DRAFT", note: `Drafted ${round}.${roundPick}` } });
    const complete = draft.currentPick >= draft.pickOrder.length;
    await tx.draft.update({ where: { id: draft.id }, data: complete ? { status: "COMPLETE", completedAt: now } : { currentPick: { increment: 1 }, pickStartedAt: now, version: { increment: 1 } } });
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
  if (draft.status !== "ACTIVE" || !draft.pickStartedAt || draft.pickStartedAt.getTime() + draft.secondsPerPick * 1000 > now.getTime()) return null;
  const teamId = draft.pickOrder[draft.currentPick - 1];
  const fallback = await automaticCandidate(draftId, teamId);
  if (!fallback) throw new Error(`No available ${draft.sport} player remains for the automatic pick.`);
  return makePick({ draftId, playerId: fallback.id, automatic: true, system: true, now });
}

export async function setDraftPaused(userId: string, draftId: string, paused: boolean) {
  const database = getDatabase(); const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId } });
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can pause or resume the draft.");
  if (paused && draft.status !== "ACTIVE") throw new Error("Only an active draft can be paused.");
  if (!paused && draft.status !== "PAUSED") throw new Error("Only a paused draft can be resumed.");
  const now = new Date(); return database.draft.update({ where: { id: draftId }, data: paused
    ? { status: "PAUSED", pausedAt: now, version: { increment: 1 } }
    : { status: "ACTIVE", pausedAt: null, pickStartedAt: now, version: { increment: 1 } } });
}

export async function queuePlayer(userId: string, draftId: string, playerId: string) {
  const database = getDatabase(); const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId } });
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  const player = await database.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.sport !== draft.sport) throw new Error(`Only ${draft.sport} players can be queued here.`);
  const rank = await database.draftQueueEntry.count({ where: { draftId, teamId: membership.fantasyTeam.id } }) + 1;
  return database.draftQueueEntry.create({ data: { draftId, teamId: membership.fantasyTeam.id, playerId, rank } });
}

export function playerFitsRoster(sport: Sport, slot: string, positions: string[]) { return fitsSlot(sport, slot, new Set(positions)); }
