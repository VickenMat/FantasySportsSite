import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { fitsSlot } from "@/simulation/config";
import { leagueContext } from "./league";

function teamForPick(order: readonly string[], overall: number) {
  const index = overall - 1;
  const round = Math.floor(index / order.length);
  const offset = index % order.length;
  return order[round % 2 ? order.length - 1 - offset : offset];
}

export async function createDraft(userId: string, leagueId: string) {
  const membership = await leagueContext(userId, leagueId);
  if (membership?.role !== "COMMISSIONER") throw new Error("Only the commissioner can start the draft.");
  if (membership.league.teams.length !== membership.league.maxTeams) throw new Error("Fill every team slot before starting the draft.");
  const order = membership.league.teams.map(({ id }) => id);
  return getDatabase().$transaction(async (tx) => {
    const existing = await tx.draft.findFirst({ where: { leagueId, status: { in: ["SCHEDULED", "ACTIVE"] } } });
    if (existing) return existing;
    await tx.league.update({ where: { id: leagueId }, data: { status: "DRAFTING" } });
    return tx.draft.create({ data: {
      leagueId, status: "ACTIVE", rounds: membership.league.draftRounds, order,
      startedAt: new Date(), secondsPerPick: 90,
    } });
  }, { isolationLevel: "Serializable" });
}

export async function availablePlayers(leagueId: string, search = "", position?: string) {
  const league = await getDatabase().league.findUniqueOrThrow({ where: { id: leagueId } });
  const players = await getDatabase().player.findMany({
    where: {
      sport: league.primarySport ?? undefined,
      displayName: search ? { contains: search, mode: "insensitive" } : undefined,
      rosterEntries: { none: { leagueId } },
      gameStats: position ? { some: { observedPositions: { has: position } } } : undefined,
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 200,
    include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, select: { observedPositions: true } } },
  });
  return players.map((player) => ({ ...player, positions: player.gameStats[0]?.observedPositions ?? [] }));
}

export async function makePick(input: { userId: string; draftId: string; playerId: string; automatic?: boolean }) {
  z.uuid().parse(input.draftId); z.uuid().parse(input.playerId);
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: input.draftId }, include: { league: true } });
    if (draft.status !== "ACTIVE") throw new Error("The draft is not active.");
    const teamId = teamForPick(draft.order, draft.currentPick);
    const team = await tx.fantasyTeam.findUniqueOrThrow({ where: { id: teamId } });
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId: input.userId } } });
    const authorized = team.managerId === input.userId || (input.automatic && member?.role === "COMMISSIONER");
    if (!authorized) throw new Error("It is another manager's turn.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: input.playerId } });
    if (player.sport !== draft.league.primarySport) throw new Error("This player belongs to another sport.");
    const totalPicks = draft.rounds * draft.order.length;
    const round = Math.floor((draft.currentPick - 1) / draft.order.length) + 1;
    const roundPick = (draft.currentPick - 1) % draft.order.length + 1;
    const pick = await tx.draftPick.create({ data: {
      draftId: draft.id, teamId, playerId: player.id, overall: draft.currentPick, round, roundPick, automatic: input.automatic ?? false,
    } });
    await tx.rosterEntry.create({ data: { leagueId: draft.leagueId, teamId, playerId: player.id, slot: "BENCH" } });
    await tx.fantasyTransaction.create({ data: { leagueId: draft.leagueId, teamId, playerId: player.id, type: "DRAFT", note: `Drafted ${round}.${roundPick}` } });
    const complete = draft.currentPick >= totalPicks;
    await tx.draft.update({ where: { id: draft.id }, data: complete
      ? { status: "COMPLETE", completedAt: new Date() }
      : { currentPick: { increment: 1 } } });
    if (complete) await tx.league.update({ where: { id: draft.leagueId }, data: { status: "ACTIVE" } });
    return pick;
  }, { isolationLevel: "Serializable" });
}

export async function autoPick(userId: string, draftId: string) {
  const draft = await getDatabase().draft.findUniqueOrThrow({ where: { id: draftId }, include: { league: true } });
  const teamId = teamForPick(draft.order, draft.currentPick);
  const queued = await getDatabase().draftQueueEntry.findMany({
    where: { draftId, teamId, player: { rosterEntries: { none: { leagueId: draft.leagueId } } } },
    orderBy: { rank: "asc" }, include: { player: true },
  });
  const players = await availablePlayers(draft.leagueId);
  const candidate = queued[0]?.player ?? players[0];
  if (!candidate) throw new Error("No available players remain.");
  return makePick({ userId, draftId, playerId: candidate.id, automatic: true });
}

export async function queuePlayer(userId: string, draftId: string, playerId: string) {
  const database = getDatabase();
  const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId } });
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a team in this league.");
  const rank = await database.draftQueueEntry.count({ where: { draftId, teamId: membership.fantasyTeam.id } }) + 1;
  return database.draftQueueEntry.create({ data: { draftId, teamId: membership.fantasyTeam.id, playerId, rank } });
}

export function playerFitsRoster(sport: "NFL" | "MLB" | "NBA" | "NHL", slot: string, positions: string[]) {
  return fitsSlot(sport, slot, new Set(positions));
}
