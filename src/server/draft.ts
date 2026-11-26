import { z } from "zod";
import { draftCorrectionState, draftJobKey } from "./draft-corrections";
import type { Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { firstOpenSlot } from "@/rosters/compliance";
import { fitsSlot } from "@/simulation/config";
import { leagueContext, resolveLeagueSport } from "./league";
import { currentCompliance } from "./rosters";
import { ensureRelativeMatchupSchedule } from "./matchups";
import { GameplayBlockedError, runBackgroundJob } from "./background-jobs";
import { keeperPickSlots } from "./keeper-costs";
import { assertRookieDraftWindow, eligibleRookieIds } from "./rookies";
import { consumptionKey, type RookieSnapshot } from "./dynasty-picks";
import { assertQueueRoomAccess, testingDraftShortcutAllowed } from "./draft-plans";
import { hasGameplayTable } from "./gameplay-storage";
import { accountForAcquisition, financePolicy } from "./finance";
import { openAcquisitionSlot } from "@/rosters/acquisition-slot";
import { captureDraftSelection } from "./draft-recaps";
import { getEligiblePositions, legacyPositionFallback } from "./positions";

const universalSlots = ["UNIVERSAL_BENCH", "UNIVERSAL_IR", "IR"];

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

export async function createDraft(userId: string, leagueId: string, requestedSport?: Sport | string, options: { planId?: string; now?: Date } = {}) {
  if (!options.planId && !testingDraftShortcutAllowed()) throw new Error("Start Draft Now is restricted to development or explicitly authorized test environments. Schedule your draft through the Draft tab.");
  let plan = options.planId ? await getDatabase().draftPlan.findFirstOrThrow({ where: { id: options.planId, leagueId }, include: { leagueSport: true } }) : null;
  if (!plan && await hasGameplayTable("DraftPlan")) plan = await getDatabase().draftPlan.findFirst({ where: { leagueId, scope: "UNIVERSAL", status: { notIn: ["COMPLETED", "CANCELLED"] } }, include: { leagueSport: true } });
  const membership = await leagueContext(userId, leagueId);
  if (membership?.role !== "COMMISSIONER") throw new Error("Only the commissioner can start the draft.");
  const leagueSport = await resolveLeagueSport(leagueId, plan?.leagueSport.sport ?? requestedSport);
  if (!plan && await hasGameplayTable("DraftPlan")) plan = await getDatabase().draftPlan.findUnique({ where: { leagueSportId_seasonId_kind: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId, kind: "INITIAL" } }, include: { leagueSport: true } });
  const filled = membership.league.teams.length;
  if (filled !== membership.league.maxTeams) {
    const open = membership.league.maxTeams - filled;
    throw new Error(`This league has ${filled} of ${membership.league.maxTeams} team slots filled. Invite ${open} more manager${open === 1 ? "" : "s"}, reduce the league capacity to ${filled}, or add computer-controlled franchises.`);
  }
  const currentTeamIds = membership.league.teams.map(({ id }) => id);
  const configured = plan?.order ?? leagueSport.draftOrder;
  const rounds = plan?.rounds ?? leagueSport.draftRounds;
  const secondsPerPick = plan?.secondsPerPick ?? leagueSport.draftSecondsPerPick;
  if (plan && (configured.length !== currentTeamIds.length || new Set(configured).size !== currentTeamIds.length || configured.some((id) => !currentTeamIds.includes(id)))) throw new GameplayBlockedError("The saved draft order no longer matches participating franchises. The commissioner must save a complete order.");
  const order = configured.length === currentTeamIds.length && new Set(configured).size === currentTeamIds.length && configured.every((id) => currentTeamIds.includes(id)) ? configured : currentTeamIds;
  const retainedRows = await getDatabase().rosterEntry.groupBy({
    by: ["teamId"], where: { leagueId, sport: leagueSport.sport, releasedAt: null, slot: { notIn: universalSlots } }, _count: true,
  });
  const retained = new Map(retainedRows.map((row) => [row.teamId, row._count]));
  const keeperCosts = membership.league.format === "REDRAFT" ? await getDatabase().keeperSelection.findMany({
    where: { leagueSportId: leagueSport.id, retainedAt: { not: null }, season: { startYear: leagueSport.season.startYear - 1 } },
  }) : [];
  if (keeperCosts.some(({ draftCost }) => draftCost == null || draftCost < 1 || draftCost > rounds)) throw new Error("Retained keeper costs require commissioner review before this draft.");
  const costs = new Map(order.map((teamId) => [teamId, keeperCosts.filter((keeper) => keeper.teamId === teamId).map(({ draftCost }) => draftCost!)]));
  const keeperSlots = keeperCosts.length ? keeperPickSlots(order, rounds, costs) : null;
  const pickOrder = plan?.method === "AUCTION" ? Array.from({ length: rounds }, () => [...order]).flat() : keeperSlots ? keeperSlots.map(({ teamId }) => teamId) : buildPickOrder(order, rounds, retained);
  if (!pickOrder.length) throw new Error(`${leagueSport.sport} rosters are already full for this season.`);
  const now = options.now ?? new Date();
  return getDatabase().$transaction(async (tx) => {
    if ((await financePolicy(tx, leagueId))?.salaryMode && plan?.method !== "AUCTION") throw new Error("Salary dynasty initial drafts must use auction.");
    if (plan) {
      const latest = await tx.draftPlan.findUniqueOrThrow({ where: { id: plan.id } });
      if (latest.version !== plan.version || (options.planId && (!latest.scheduledAt || latest.scheduledAt > now)) || ["CANCELLED", "COMPLETED"].includes(latest.status)) throw new Error("The scheduled start or configuration changed; refresh the draft plan.");
    }
    const coveredSports = plan?.scope === "UNIVERSAL" ? await tx.leagueSport.findMany({ where: { leagueId } }) : [leagueSport];
    if (!membership.league.isHistorical) for (const selected of coveredSports) {
      const boundary = await tx.professionalSeasonScheduleRevision.findFirst({ where: { seasonId: selected.seasonId, retrievedAt: { lte: now } }, orderBy: { retrievedAt: "desc" } });
      if (boundary?.status !== "AVAILABLE" || !boundary.regularSeasonStartsAt) throw new GameplayBlockedError("PENDING_DATA: the selected season needs a verified professional start before drafting can begin.");
      if (+now + pickOrder.length * secondsPerPick * 1000 >= +boundary.regularSeasonStartsAt) throw new GameplayBlockedError("The draft cannot fit before the selected professional season. Reschedule without changing the selected season.");
    }
    for (const teamId of currentTeamIds) {
      const compliance = await currentCompliance(tx, teamId, now);
      if (compliance.state !== "COMPLIANT") throw new GameplayBlockedError(`Franchise ${teamId}: ${compliance.reasons.join(" ")}`);
    }
    if (await tx.draft.findFirst({ where: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId, kind: "ROOKIE", status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } } })) throw new Error("This sport already has a rookie draft; its reverse-placement plan cannot be replaced by an initial draft.");
    const existing = await tx.draft.findUnique({ where: { leagueSportId_seasonId_kind: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId, kind: "INITIAL" } } });
    if (existing && existing.status !== "SCHEDULED") return existing;
    await tx.league.update({ where: { id: leagueId }, data: { status: "DRAFTING" } });
    const data = {
      leagueId, leagueSportId: leagueSport.id, sport: leagueSport.sport, status: "ACTIVE", rounds,
      seasonId: leagueSport.seasonId,
      orderProvenance: plan?.method === "AUCTION" ? JSON.stringify({ method: "AUCTION", nominationOrder: order }) : keeperSlots ? JSON.stringify({ method: "SNAKE_KEEPER", slots: keeperSlots }) : null,
      order, pickOrder, startedAt: now, pickStartedAt: now, pickDeadlineAt: new Date(now.getTime() + secondsPerPick * 1000), secondsPerPick,
    } as const;
    const draft = existing ? await tx.draft.update({ where: { id: existing.id }, data }) : await tx.draft.create({ data });
    if (plan?.method === "AUCTION") for (const selected of coveredSports) for (const teamId of order) await accountForAcquisition(tx, selected.id, teamId, draft.id);
    if (await hasGameplayTable("DraftPlan", tx)) await tx.draftPlan.updateMany({ where: { draftId: draft.id }, data: { status: "IN_PROGRESS", blockedReason: null } });
    return draft;
  }, { isolationLevel: "Serializable" });
}

export async function playerPage(leagueId: string, options: { sport?: Sport | string; search?: string; position?: string; positions?: string[]; page?: number; pageSize?: number; allResults?: boolean; rookieOnly?: boolean; availability?: "ALL" | "FREE_AGENTS" | "WAIVERS" | "ROSTERED" | "AVAILABLE" } = {}) {
  const leagueSport = await resolveLeagueSport(leagueId, options.sport); const page = Number.isFinite(options.page ?? 1) ? Math.max(1, Math.trunc(options.page ?? 1)) : 1;
  const pageSize = Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 50)));
  const league = await getDatabase().league.findUniqueOrThrow({ where: { id: leagueId }, select: { isHistorical: true } });
  const cutoff = new Date(Date.now() - 86400000);
  const holds = { OR: [{ rosterEntries: { some: { leagueId, releasedAt: { gt: cutoff } } } }, { gameStats: { some: { game: { completionEvidence: { some: { knownAt: { lte: new Date() }, completedAt: { gt: cutoff } } } } } } }] };
  const where = { sport: leagueSport.sport, isSynthetic: false, id: options.rookieOnly ? { in: await eligibleRookieIds(getDatabase(), leagueSport.seasonId, new Date()) } : undefined, displayName: options.search ? { contains: options.search, mode: "insensitive" as const } : undefined,
    rosterEntries: options.availability === "ALL" ? undefined : options.availability === "ROSTERED" ? { some: { leagueId, sport: leagueSport.sport, releasedAt: null } } : { none: { leagueId, sport: leagueSport.sport, releasedAt: null } },
    AND: [
      ...(options.availability === "WAIVERS" ? [holds] : options.availability === "FREE_AGENTS" ? [{ NOT: holds }] : []),
      ...((options.positions?.length || options.position) ? [{ gameStats: { some: { observedPositions: { hasSome: options.positions?.length ? options.positions : [options.position!] }, ...(league.isHistorical ? { game: { seasonId: leagueSport.seasonId } } : {}) } } }] : []),
    ],
    ...(options.rookieOnly || !league.isHistorical ? {} : { OR: [{ isDemo: true }, { gameStats: { some: { game: { seasonId: leagueSport.seasonId } } } }] }) };
  const database = getDatabase();
  const [players, total] = await Promise.all([database.player.findMany({ where, orderBy: [{ displayName: "asc" }, { id: "asc" }],
    skip: options.allResults ? undefined : (page - 1) * pageSize, take: options.allResults ? undefined : pageSize, include: { gameStats: { where: { game: { seasonId: leagueSport.seasonId } }, orderBy: { recordedAt: "desc" }, take: 1, select: { observedPositions: true, team: { select: { code: true, displayName: true } } } } } }),
  database.player.count({ where })]);
  return { items: players.map((player) => ({ ...player, positions: player.gameStats[0]?.observedPositions ?? [] })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sport: leagueSport.sport };
}

export async function availablePlayers(leagueId: string, search = "", position?: string, limit = 200, sport?: Sport | string, rookieOnly = false) {
  return (await playerPage(leagueId, { sport, search, position, pageSize: Math.min(100, limit), rookieOnly })).items;
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
  const plan = await hasGameplayTable("DraftPlan") ? await database.draftPlan.findUnique({ where: { draftId } }) : null;
  if (plan?.scope === "UNIVERSAL") {
    const sports = await database.leagueSport.findMany({ where: { leagueId: draft.leagueId }, include: { season: true, league: true } });
    const entries = await database.rosterEntry.findMany({ where: { teamId, releasedAt: null } });
    const rosters = await database.fantasyRoster.findMany({ where: { teamId } });
    const canFit = async (player: { id: string; sport: Sport }) => {
      const sport = sports.find((row) => row.sport === player.sport);
      const roster = rosters.find((row) => row.leagueSportId === sport?.id);
      if (!sport || !roster || await database.rosterEntry.findFirst({ where: { leagueId: draft.leagueId, playerId: player.id, releasedAt: null } })) return false;
      const positions = await getEligiblePositions({ playerId: player.id, sport: player.sport, seasonYear: sport.season.startYear, asOf: new Date() }, database);
      return Boolean(openAcquisitionSlot({ sport: player.sport, rosterId: roster.id, starters: sport.rosterSlots, bench: sport.benchSlots, universalBench: sport.league.universalBenchSlots, positions: new Set(positions.positions), entries }));
    };
    const queue = await database.draftQueueEntry.findMany({ where: { draftId, teamId }, orderBy: { rank: "asc" }, include: { player: true } });
    for (const { player } of queue) if (await canFit(player)) return player;
    for (const sport of sports) {
      let page = 1;
      for (;;) {
        const pool = await playerPage(draft.leagueId, { sport: sport.sport, page, pageSize: 100 });
        for (const player of pool.items) if (await canFit(player)) return player;
        if (pool.items.length < 100) break;
        page++;
      }
    }
    return null;
  }
  const rookieOnly = draft.kind === "ROOKIE";
  const queue = await database.draftQueueEntry.findMany({ where: { draftId, teamId, player: { sport: draft.sport, ...(rookieOnly ? { id: { in: await eligibleRookieIds(database, draft.seasonId, new Date()) } } : {}), rosterEntries: { none: { leagueId: draft.leagueId, sport: draft.sport, releasedAt: null } } } }, orderBy: { rank: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  const [roster, candidates] = await Promise.all([
    database.rosterEntry.findMany({ where: { leagueId: draft.leagueId, sport: draft.sport, teamId, releasedAt: null, slot: { notIn: universalSlots } }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } }),
    availablePlayers(draft.leagueId, "", undefined, 100, draft.sport, rookieOnly),
  ]);
  if (!rookieOnly && roster.length >= draft.leagueSport.rosterSlots.length + draft.leagueSport.benchSlots) return null;
  if (queue[0]) return queue[0].player;
  const choice = chooseAutomaticPlayer(draft.sport, draft.leagueSport.rosterSlots,
    roster.map(({ player }) => ({ id: player.id, positions: legacyPositionFallback(player.gameStats[0]) })), candidates);
  return choice ? candidates.find(({ id }) => id === choice.id) ?? null : null;
}

export async function makePick(input: { userId?: string; draftId: string; playerId: string; automatic?: boolean; system?: boolean; now?: Date; expectedPick?: number }, transaction?: Prisma.TransactionClient) {
  z.uuid().parse(input.draftId); z.uuid().parse(input.playerId); const database = getDatabase();
  const work = async (tx: Prisma.TransactionClient) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: input.draftId }, include: { leagueSport: true } });
    if (input.expectedPick !== undefined && input.expectedPick !== draft.currentPick) throw new Error("The draft pick changed before selection; refresh the current pick.");
    if (draft.status !== "ACTIVE") throw new Error("The draft is not active.");
    if (draft.orderProvenance?.includes('"method":"AUCTION"')) throw new Error("Auction players are selected by atomic auction settlement, not ordinary picks.");
    if ((await financePolicy(tx, draft.leagueId))?.salaryMode) throw new Error("Salary dynasty selections must settle through their auction.");
    const teamId = draft.pickOrder[draft.currentPick - 1];
    if (!teamId) throw new Error("The draft pick order is complete.");
    const team = await tx.fantasyTeam.findUniqueOrThrow({ where: { id: teamId } });
    const member = input.userId ? await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId: input.userId } } }) : null;
    const now = input.now ?? new Date(); const deadline = draft.pickDeadlineAt ?? (draft.pickStartedAt ? new Date(draft.pickStartedAt.getTime() + draft.secondsPerPick * 1000) : null);
    const systemAuthorized = input.system === true && input.automatic === true && deadline != null && deadline <= now;
    if (!(systemAuthorized || team.managerId === input.userId || (input.automatic && member?.role === "COMMISSIONER"))) throw new Error("It is another manager's turn.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: input.playerId }, include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1, select: { observedPositions: true, raw: true } } } });
    const draftPlan = await hasGameplayTable("DraftPlan", tx) ? await tx.draftPlan.findUnique({ where: { draftId: draft.id } }) : null;
    if (player.sport !== draft.sport && draftPlan?.scope !== "UNIVERSAL") throw new Error(`Only ${draft.sport} players are eligible for this draft.`);
    const selectionSport = draftPlan?.scope === "UNIVERSAL" ? await tx.leagueSport.findFirstOrThrow({ where: { leagueId: draft.leagueId, sport: player.sport } }) : draft.leagueSport;
    if (draft.kind === "ROOKIE") await assertRookieDraftWindow(tx, draft.leagueId, draft.seasonId, now);
    if (draft.kind === "ROOKIE" && !(await eligibleRookieIds(tx, draft.seasonId, now)).includes(player.id)) throw new Error("PENDING_DATA: current verified rookie eligibility is required for this selection.");
    const roster = await tx.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId, leagueSportId: selectionSport.id } } });
    const compliance = await currentCompliance(tx, teamId, now);
    if (compliance.state !== "COMPLIANT" && !(draft.kind === "ROOKIE" && compliance.reasons.every((reason) => reason.startsWith("Rookie draft overflow on ")))) throw new GameplayBlockedError(`Roster noncompliance for franchise ${team.name} (${teamId}): ${compliance.reasons.join(" ")} Move eligible players to legal open slots or release players to restore compliance. Automatic recovery checks every minute.`);
    let round = Math.floor((draft.currentPick - 1) / draft.order.length) + 1;
    let roundPick = (draft.currentPick - 1) % draft.order.length + 1;
    if (draft.orderProvenance?.startsWith("{")) {
      const snapshot = JSON.parse(draft.orderProvenance);
      if (snapshot.method === "SNAKE_KEEPER" || snapshot.method === "LINEAR_ROOKIE") {
        const slot = snapshot.slots[draft.currentPick - 1];
        if (!slot || (snapshot.method === "SNAKE_KEEPER" && slot.teamId !== teamId) || !Number.isInteger(slot.round) || !Number.isInteger(slot.roundPick)) throw new GameplayBlockedError("The draft order snapshot is inconsistent. Commissioner review is required.");
        round = slot.round; roundPick = slot.roundPick;
      }
    }
    const activeRoster = await tx.rosterEntry.findMany({
      where: { rosterId: roster.id, releasedAt: null, slot: { notIn: universalSlots } }, select: { slot: true, slotIndex: true },
    });
    const maximum = draft.leagueSport.rosterSlots.length + draft.leagueSport.benchSlots;
    if (draft.kind !== "ROOKIE" && draftPlan?.scope !== "UNIVERSAL" && activeRoster.length >= maximum) throw new GameplayBlockedError("This sport roster is full. The commissioner must review remaining picks and roster capacity.");
    const trusted = await getEligiblePositions({ playerId: player.id, sport: player.sport, seasonYear: (await tx.season.findUniqueOrThrow({ where: { id: selectionSport.seasonId } })).startYear, asOf: now }, tx);
    const universalPlacement = draftPlan?.scope === "UNIVERSAL" ? openAcquisitionSlot({ sport: player.sport, rosterId: roster.id, starters: selectionSport.rosterSlots, bench: selectionSport.benchSlots,
      universalBench: (await tx.league.findUniqueOrThrow({ where: { id: draft.leagueId } })).universalBenchSlots, positions: new Set(trusted.available ? trusted.positions : legacyPositionFallback(player.gameStats[0])), entries: await tx.rosterEntry.findMany({ where: { teamId, releasedAt: null } }) }) : null;
    if (draftPlan?.scope === "UNIVERSAL" && !universalPlacement) throw new GameplayBlockedError("No legal sport or shared bench position remains for this universal selection.");
    const positions = new Set(trusted.available ? trusted.positions : legacyPositionFallback(player.gameStats[0])); const occupied = new Map<string, number>();
    for (const entry of activeRoster) occupied.set(entry.slot, (occupied.get(entry.slot) ?? 0) + 1);
    let slot = universalPlacement?.slot ?? draft.leagueSport.rosterSlots.find((candidate) => fitsSlot(draft.sport, candidate, positions) && (occupied.get(candidate) ?? 0) < draft.leagueSport.rosterSlots.filter((value) => value === candidate).length) ?? "BENCH";
    if (draft.kind === "ROOKIE" && slot === "BENCH" && (occupied.get("BENCH") ?? 0) >= draft.leagueSport.benchSlots) slot = "ROOKIE_OVERFLOW";
    const capacity = slot === "ROOKIE_OVERFLOW" ? draft.pickOrder.length : slot === "BENCH" ? draft.leagueSport.benchSlots : draft.leagueSport.rosterSlots.filter((value) => value === slot).length;
    const usedIndexes = new Set(activeRoster.filter((entry) => entry.slot === slot).map(({ slotIndex }) => slotIndex));
    const slotIndex = universalPlacement?.slotIndex ?? firstOpenSlot(usedIndexes, capacity);
    if (!slotIndex) throw new GameplayBlockedError(`No open ${slot} roster position remains. Move a player to a legal open position before drafting.`);
    const previous = await tx.draftPick.findUnique({ where: { draftId_overall: { draftId: draft.id, overall: draft.currentPick } } });
    if (previous && (await draftCorrectionState(tx, [previous.id])).get(previous.id)?.action !== "UNDO_DRAFT_PICK") throw new Error("This draft selection is already recorded.");
    const pickData = { draftId: draft.id, teamId, playerId: player.id, overall: draft.currentPick, round, roundPick, automatic: input.automatic ?? false, pickedAt: now };
    const pick = previous ? await tx.draftPick.update({ where: { id: previous.id }, data: pickData }) : await tx.draftPick.create({ data: pickData });
    if (draft.kind === "ROOKIE") {
      const snapshot = JSON.parse(draft.orderProvenance ?? "null") as RookieSnapshot | null;
      const slot = snapshot?.method === "LINEAR_ROOKIE" ? snapshot.slots[draft.currentPick - 1] : null;
      if (!slot) throw new GameplayBlockedError("The rookie entitlement snapshot is unavailable.");
      const entitlement = await tx.futureDraftPick.findUniqueOrThrow({ where: { id: slot.futurePickId }, include: { leagueSport: true } });
      if (entitlement.ownerTeamId !== teamId || entitlement.leagueSportId !== draft.leagueSportId || entitlement.round !== round || entitlement.originalTeamId !== slot.originalTeamId) throw new GameplayBlockedError("Rookie pick ownership changed; refresh the draft.");
      await tx.futureDraftPickOwnership.create({ data: { pickId: entitlement.id, ownerTeamId: teamId,
        reason: `Consumed by rookie draft selection ${pick.id}`, idempotencyKey: consumptionKey(entitlement.id) } });
    }
    const provenance = draft.kind === "ROOKIE" ? JSON.parse(draft.orderProvenance!) as RookieSnapshot : null;
    await captureDraftSelection(tx, pick.id, provenance?.slots[draft.currentPick - 1]?.originalTeamId ?? teamId, draft.kind === "ROOKIE" ? "LINEAR" : "SNAKE");
    const entry = await tx.rosterEntry.create({ data: { leagueId: draft.leagueId, teamId, rosterId: roster.id, playerId: player.id, sport: player.sport, seasonId: selectionSport.seasonId, slot, slotIndex, acquiredAt: now } });
    await tx.rosterAssignmentEvent.create({ data: { leagueId: draft.leagueId, teamId, rosterEntryId: entry.id, actorUserId: input.userId,
      toSlot: slot, toSlotIndex: slotIndex, effectiveAt: now, reason: "Draft selection", idempotencyKey: `draft-pick:${pick.id}:${entry.id}` } });
    await tx.fantasyTransaction.create({ data: { leagueId: draft.leagueId, leagueSportId: selectionSport.id, rosterId: roster.id, sport: player.sport, teamId, playerId: player.id, type: "DRAFT", note: `Drafted ${round}.${roundPick}` } });
    const complete = draft.currentPick >= draft.pickOrder.length;
    if (complete && await hasGameplayTable("DraftPlan", tx)) await tx.draftPlan.updateMany({ where: { draftId: draft.id }, data: { status: "COMPLETED", blockedReason: null } });
    await tx.draft.update({ where: { id: draft.id }, data: complete ? { status: "COMPLETE", completedAt: now, pickDeadlineAt: null, pausedRemainingMs: null } : { currentPick: { increment: 1 }, pickStartedAt: now, pickDeadlineAt: new Date(now.getTime() + draft.secondsPerPick * 1000), pausedRemainingMs: null, version: { increment: 1 } } });
    await tx.draftQueueEntry.deleteMany({ where: { draftId: draft.id, playerId: player.id } });
    if (complete && draft.kind === "INITIAL") for (const covered of draftPlan?.scope === "UNIVERSAL" ? await tx.leagueSport.findMany({ where: { leagueId: draft.leagueId } }) : [draft.leagueSport]) await ensureRelativeMatchupSchedule(tx, {
      leagueId: draft.leagueId, leagueSportId: covered.id, sport: covered.sport, periods: covered.regularSeasonMatchups,
    });
    if (complete && await tx.draft.count({ where: { leagueId: draft.leagueId, id: { not: draft.id }, status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] } } }) === 0) {
      await tx.league.update({ where: { id: draft.leagueId }, data: { status: "ACTIVE" } });
    }
    return pick;
  };
  return transaction ? work(transaction) : database.$transaction(work, { isolationLevel: "Serializable" });
}

export async function autoPick(userId: string, draftId: string) {
  const draft = await getDatabase().draft.findUniqueOrThrow({ where: { id: draftId } }); const teamId = draft.pickOrder[draft.currentPick - 1];
  const candidate = await automaticCandidate(draftId, teamId);
  if (!candidate) throw new Error(`No available ${draft.sport} players remain.`);
  return makePick({ userId, draftId, playerId: candidate.id, automatic: true });
}

export async function autoPickExpiredDraft(draftId: string, now = new Date(), expectedPick?: number) {
  const draft = await getDatabase().draft.findUniqueOrThrow({ where: { id: draftId } });
  if (expectedPick !== undefined && draft.currentPick !== expectedPick) return null;
  const deadline = draft.pickDeadlineAt ?? (draft.pickStartedAt ? new Date(draft.pickStartedAt.getTime() + draft.secondsPerPick * 1000) : null);
  if (draft.status !== "ACTIVE" || !deadline || deadline > now) return null;
  const teamId = draft.pickOrder[draft.currentPick - 1];
  const fallback = await automaticCandidate(draftId, teamId);
  if (!fallback) throw new GameplayBlockedError(`No available ${draft.sport} player or sport roster capacity remains for this pick. Review the player pool and roster capacity.`);
  return makePick({ draftId, playerId: fallback.id, automatic: true, system: true, now, expectedPick: draft.currentPick });
}

export async function setDraftPaused(userId: string, draftId: string, paused: boolean, at = new Date()) {
  const database = getDatabase(); return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can pause or resume the draft.");
    if (paused && draft.status !== "ACTIVE") throw new Error("Only an active draft can be paused.");
    if (!paused && draft.status !== "PAUSED") throw new Error("Only a paused draft can be resumed.");
    const now = at;
    await tx.commissionerAuditEvent.create({ data: { leagueId: draft.leagueId, actorUserId: userId, action: paused ? "PAUSE_DRAFT" : "RESUME_DRAFT", targetType: "Draft", targetId: draftId, sport: draft.sport, before: { status: draft.status, pickDeadlineAt: draft.pickDeadlineAt?.toISOString() ?? null }, after: { status: paused ? "PAUSED" : "ACTIVE" }, effectiveAt: now, reason: paused ? "Commissioner explicitly paused the draft timer." : "Commissioner explicitly resumed the persisted draft timer." } });
    if (paused) {
      if (await hasGameplayTable("DraftPlan", tx)) await tx.draftPlan.updateMany({ where: { draftId }, data: { status: "PAUSED" } });
      const deadline = draft.pickDeadlineAt ?? new Date((draft.pickStartedAt?.getTime() ?? now.getTime()) + draft.secondsPerPick * 1000);
      const remaining = Math.max(0, deadline.getTime() - now.getTime());
      return tx.draft.update({ where: { id: draftId }, data: { status: "PAUSED", pausedAt: now, pausedRemainingMs: remaining, pickDeadlineAt: null, version: { increment: 1 } } });
    }
    const remaining = Math.max(0, draft.pausedRemainingMs ?? draft.secondsPerPick * 1000);
    if (await hasGameplayTable("LeagueFinancePolicy", tx)) await tx.acquisitionAuction.updateMany({ where: { draftId, status: "OPEN" }, data: { closesAt: new Date(+now + remaining) } });
    if (await hasGameplayTable("DraftPlan", tx)) await tx.draftPlan.updateMany({ where: { draftId }, data: { status: "IN_PROGRESS" } });
    return tx.draft.update({ where: { id: draftId }, data: { status: "ACTIVE", pausedAt: null, pausedRemainingMs: null, pickStartedAt: now, pickDeadlineAt: new Date(now.getTime() + remaining), version: { increment: 1 } } });
  }, { isolationLevel: "Serializable" });
}

export async function queuePlayer(userId: string, draftId: string, playerId: string, at = new Date()) {
  const database = getDatabase(); const draft = await database.draft.findUniqueOrThrow({ where: { id: draftId } });
  await assertQueueRoomAccess(database, draftId, at);
  if (!["SCHEDULED", "ACTIVE", "PAUSED"].includes(draft.status)) throw new Error("This draft queue is closed.");
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: draft.leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  const player = await database.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.sport !== draft.sport) {
    const plan = await hasGameplayTable("DraftPlan") ? await database.draftPlan.findUnique({ where: { draftId } }) : null;
    if (plan?.scope !== "UNIVERSAL" || !await database.leagueSport.findUnique({ where: { leagueId_sport: { leagueId: draft.leagueId, sport: player.sport } } })) throw new Error(`Only included draft sports can be queued here.`);
  }
  const rank = await database.draftQueueEntry.count({ where: { draftId, teamId: membership.fantasyTeam.id } }) + 1;
  return database.draftQueueEntry.upsert({ where: { draftId_teamId_playerId: { draftId, teamId: membership.fantasyTeam.id, playerId } }, update: {}, create: { draftId, teamId: membership.fantasyTeam.id, playerId, rank } });
}

export async function changeQueue(userId: string, draftId: string, entryId: string, operation: "UP" | "DOWN" | "REMOVE") {
  const database = getDatabase(); return database.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    await assertQueueRoomAccess(tx, draftId);
    if (!["SCHEDULED", "ACTIVE", "PAUSED"].includes(draft.status)) throw new Error("This draft queue is closed.");
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
    await assertQueueRoomAccess(tx, draftId);
    if (!["SCHEDULED", "ACTIVE", "PAUSED"].includes(draft.status)) throw new Error("This draft queue is closed.");
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
  const drafts = await getDatabase().draft.findMany({ where: { status: "ACTIVE", OR: [{ pickDeadlineAt: { lte: now } }, { pickDeadlineAt: null, pickStartedAt: { not: null } }] }, select: { id: true, orderProvenance: true, currentPick: true, pickDeadlineAt: true, pickStartedAt: true, secondsPerPick: true } });
  let picked = 0;
  for (const draft of drafts) {
    if (await hasGameplayTable("DraftPlan") && (await getDatabase().draftPlan.findUnique({ where: { draftId: draft.id } }))?.method === "AUCTION") continue;
    const deadline = draft.pickDeadlineAt ?? (draft.pickStartedAt ? new Date(+draft.pickStartedAt + draft.secondsPerPick * 1000) : null);
    if (!deadline || deadline > now) continue;
    const outcome = await runBackgroundJob(draftJobKey(draft), "draft-pick",
      async () => Boolean(await autoPickExpiredDraft(draft.id, now, draft.currentPick)), now);
    if (outcome.status === "COMPLETE" && outcome.value) picked++;
  }
  return picked;
}

export function playerFitsRoster(sport: Sport, slot: string, positions: string[]) { return fitsSlot(sport, slot, new Set(positions)); }
