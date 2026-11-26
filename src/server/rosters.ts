import { z } from "zod";
import { createHash } from "node:crypto";
import { Prisma, type Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { assessRosterCompliance, firstOpenSlot, type ComplianceEntry } from "@/rosters/compliance";
import { fitsSlot, slotRule } from "@/simulation/config";
import { resolveLeagueSport } from "./league";
import { captureDueGameLineups } from "./lineup-snapshots";
import { getEligiblePositions } from "./positions";
import { irEligiblePlayers } from "./roster-availability";
import { assertRookieDraftComplete } from "./rookies";
import { waiverHoldUntil } from "./waiver-holds";
import { financePolicy, releaseSalary, salaryCompliance } from "./finance";

async function managedRoster(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const membership = await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true, league: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  const roster = await getDatabase().fantasyRoster.findUnique({ where: { teamId_leagueSportId: { teamId: membership.fantasyTeam.id, leagueSportId: leagueSport.id } } });
  if (!roster) throw new Error(`Your franchise has no ${leagueSport.sport} roster.`);
  return { membership, roster, leagueSport };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function currentCompliance(tx: Prisma.TransactionClient, teamId: string, at: Date) {
  const team = await tx.fantasyTeam.findUniqueOrThrow({
    where: { id: teamId },
    include: { league: true, sportRosters: { include: { leagueSport: true, entries: { where: { releasedAt: null } } } } },
  });
  const active = team.sportRosters.flatMap(({ entries }) => entries);
  const irPlayers = active.filter(({ slot }) => slot === "IR" || slot === "UNIVERSAL_IR").map(({ playerId }) => playerId);
  const eligible = await irEligiblePlayers(tx, irPlayers, at);
  const entries: ComplianceEntry[] = active.map((entry) => ({
    id: entry.id, rosterId: entry.rosterId, playerId: entry.playerId, sport: entry.sport, slot: entry.slot,
    slotIndex: entry.slotIndex, irEligible: eligible.has(entry.playerId),
  }));
  const result = assessRosterCompliance(entries, {
    universalBenchSlots: team.league.universalBenchSlots,
    universalIrSlots: team.league.universalIrSlots,
    sportBenchSlots: new Map(team.sportRosters.map((roster) => [roster.id, roster.leagueSport.benchSlots])),
  });
  const salary = await salaryCompliance(tx, teamId);
  if (!salary.compliant) { result.state = "OVER_CAPACITY"; result.reasons.push(...salary.reasons); result.violationCount += salary.excess; }
  const sourceHash = hash({ entries: entries.map(({ id, slot, slotIndex, irEligible }) => ({ id, slot, slotIndex, irEligible })).sort((a, b) => a.id.localeCompare(b.id)), result });
  await tx.rosterComplianceSnapshot.createMany({ data: [{
    leagueId: team.leagueId, teamId, state: result.state, reasons: result.reasons, sourceHash, evaluatedAt: at,
  }], skipDuplicates: true });
  return result;
}

async function recordMove(tx: Prisma.TransactionClient, input: {
  entryId: string; leagueId: string; teamId: string; actorUserId?: string; fromSlot?: string; fromSlotIndex?: number;
  toSlot: string; toSlotIndex: number; effectiveAt: Date; reason: string; key: string;
}) {
  return tx.rosterAssignmentEvent.create({ data: {
    rosterEntryId: input.entryId, leagueId: input.leagueId, teamId: input.teamId, actorUserId: input.actorUserId,
    fromSlot: input.fromSlot, fromSlotIndex: input.fromSlotIndex, toSlot: input.toSlot, toSlotIndex: input.toSlotIndex,
    effectiveAt: input.effectiveAt, reason: input.reason, idempotencyKey: input.key,
  } });
}

export async function addFreeAgent(userId: string, leagueId: string, playerId: string, sport?: Sport | string) {
  z.uuid().parse(playerId); const context = await managedRoster(userId, leagueId, sport); const database = getDatabase();
  return database.$transaction(async (tx) => {
    if ((await financePolicy(tx, leagueId))?.salaryMode) throw new Error("Salary dynasty free agents are acquired through sealed Vickrey auctions.");
    const before = await currentCompliance(tx, context.membership.fantasyTeam!.id, new Date());
    if (before.state !== "COMPLIANT") throw new Error("Resolve roster noncompliance before acquiring another player.");
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.sport !== context.leagueSport.sport) throw new Error(`This player is not eligible for the ${context.leagueSport.sport} roster.`);
    const acquiredAt = new Date();
    await assertRookieDraftComplete(tx, context.leagueSport.id, context.leagueSport.seasonId, playerId, acquiredAt);
    if (!context.membership.league.isHistorical && context.membership.league.format === "REDRAFT") {
      const completedDraft = await tx.draft.findFirst({ where: {
        leagueSportId: context.leagueSport.id, seasonId: context.leagueSport.seasonId, status: "COMPLETE",
      }, select: { id: true } });
      if (!completedDraft) throw new Error("Redraft free agency opens after the applicable sport draft completes.");
    }
    const hold = await waiverHoldUntil(tx, leagueId, playerId, acquiredAt);
    if (hold && hold > acquiredAt) throw new Error("This player is on release waivers or a verified game-completion hold. Submit a waiver claim.");
    if (await tx.waiverClaim.findFirst({ where: { leagueId, addPlayerId: playerId, status: "PENDING" }, select: { id: true } })) {
      throw new Error("This player has pending waiver claims.");
    }
    const bench = await tx.rosterEntry.findMany({ where: { rosterId: context.roster.id, releasedAt: null, slot: "BENCH" }, select: { slotIndex: true } });
    const slotIndex = firstOpenSlot(new Set(bench.map(({ slotIndex }) => slotIndex)), context.leagueSport.benchSlots);
    if (!slotIndex) throw new Error("Your sport bench is full. Move an eligible player to a universal bench slot or release a player first.");
    const entry = await tx.rosterEntry.create({ data: {
      leagueId, teamId: context.membership.fantasyTeam!.id, rosterId: context.roster.id, playerId,
      sport: context.leagueSport.sport, seasonId: context.leagueSport.seasonId, slot: "BENCH", slotIndex, acquiredAt,
    } });
    await recordMove(tx, { entryId: entry.id, leagueId, teamId: entry.teamId, actorUserId: userId, toSlot: "BENCH", toSlotIndex: slotIndex,
      effectiveAt: acquiredAt, reason: "Free-agent acquisition", key: `acquire:${entry.id}` });
    await tx.fantasyTransaction.create({ data: {
      leagueId, leagueSportId: context.leagueSport.id, rosterId: context.roster.id, sport: context.leagueSport.sport,
      teamId: context.membership.fantasyTeam!.id, playerId, type: "ADD", note: "Free-agent add",
    } });
    await currentCompliance(tx, entry.teamId, acquiredAt);
    return entry;
  }, { isolationLevel: "Serializable" });
}

export async function dropPlayer(userId: string, leagueId: string, playerId: string, sport?: Sport | string, at = new Date()) {
  const context = await managedRoster(userId, leagueId, sport); const database = getDatabase();
  await captureDueGameLineups(new Date());
  return database.$transaction(async (tx) => {
    const entry = await tx.rosterEntry.findFirst({ where: { rosterId: context.roster.id, playerId, releasedAt: null } });
    if (!entry) throw new Error("That player is not on your active sport roster.");
    if (entry.lockedAt) throw new Error("That roster slot is locked.");
    const releasedAt = at;
    await releaseSalary(tx, leagueId, playerId, entry.teamId, releasedAt);
    await tx.rosterEntry.update({ where: { id: entry.id }, data: { releasedAt } });
    await recordMove(tx, { entryId: entry.id, leagueId, teamId: entry.teamId, actorUserId: userId,
      fromSlot: entry.slot, fromSlotIndex: entry.slotIndex, toSlot: "RELEASED", toSlotIndex: 1,
      effectiveAt: releasedAt, reason: "Player release", key: `release:${entry.id}:${releasedAt.toISOString()}` });
    await tx.fantasyTransaction.create({ data: {
      leagueId, leagueSportId: context.leagueSport.id, rosterId: context.roster.id, sport: context.leagueSport.sport,
      teamId: entry.teamId, playerId, type: "DROP", note: "Player dropped",
    } });
    await currentCompliance(tx, entry.teamId, releasedAt);
  });
}

export async function setLineupSlot(userId: string, leagueId: string, rosterEntryId: string, slot: string, sport?: Sport | string, destinationEntryId?: string | null, slotIndex?: number) {
  const context = await managedRoster(userId, leagueId, sport);
  const requestedSlot = z.string().trim().toUpperCase().max(30).parse(slot);
  const normalizedSlot = requestedSlot === "IR" ? "UNIVERSAL_IR" : requestedSlot;
  const requestedIndex = z.number().int().positive().optional().parse(slotIndex);
  const database = getDatabase();
  await captureDueGameLineups(new Date());
  const entry = await database.rosterEntry.findUnique({ where: { id: rosterEntryId }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  if (!entry || entry.rosterId !== context.roster.id || entry.releasedAt) throw new Error("That roster entry is unavailable.");
  if (entry.lockedAt) throw new Error("That roster slot is locked.");
  const now = new Date();
  const period = context.membership.league.isHistorical
    ? await database.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId, sport: context.leagueSport.sport, number: Math.max(1, context.membership.league.currentPeriod) } } })
    : await database.scoringPeriod.findFirst({ where: { leagueId, sport: context.leagueSport.sport, startsAt: { lte: now }, endsAt: { gte: now } } });
  const decisionAt = context.membership.league.isHistorical ? period?.startsAt ?? now : now;
  const isStarter = normalizedSlot !== "BENCH" && normalizedSlot !== "UNIVERSAL_BENCH" && normalizedSlot !== "UNIVERSAL_IR";
  if (isStarter) {
    const allowed = context.leagueSport.rosterSlots.filter((value) => value === normalizedSlot).length;
    if (!allowed) throw new Error(`That slot is not configured for this ${context.leagueSport.sport} roster.`);
    const trusted = await getEligiblePositions({ playerId: entry.playerId, sport: context.leagueSport.sport, seasonYear: context.leagueSport.season?.startYear ?? context.membership.league.seasonYear, asOf: decisionAt });
    const positions = trusted.positions.length ? trusted.positions : context.membership.league.isHistorical ? [] : entry.player.gameStats[0]?.observedPositions ?? [];
    if (!fitsSlot(context.leagueSport.sport, normalizedSlot, new Set(positions))) throw new Error("The player's recorded eligibility does not fit that slot.");
  }
  return database.$transaction(async (tx) => {
    const current = await tx.rosterEntry.findFirst({ where: { id: entry.id, rosterId: context.roster.id, releasedAt: null }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
    if (!current || current.lockedAt) throw new Error("That roster entry is no longer movable.");
    if (!(await salaryCompliance(tx, current.teamId)).compliant) throw new Error("Over-cap franchises must cut players before making lineup changes.");
    if (normalizedSlot === "UNIVERSAL_IR" && !(await irEligiblePlayers(tx, [current.playerId], decisionAt)).has(current.playerId)) {
      throw new Error("Universal IR requires current, source-backed IR eligibility.");
    }
    const allowed = normalizedSlot === "BENCH" ? context.leagueSport.benchSlots
      : normalizedSlot === "UNIVERSAL_BENCH" ? context.membership.league.universalBenchSlots
      : normalizedSlot === "UNIVERSAL_IR" ? context.membership.league.universalIrSlots
      : context.leagueSport.rosterSlots.filter((value) => value === normalizedSlot).length;
    if (allowed < 1) throw new Error("That roster position is not configured for this league.");
    const occupants = await tx.rosterEntry.findMany({
      where: {
        teamId: current.teamId, rosterId: normalizedSlot.startsWith("UNIVERSAL_") ? undefined : context.roster.id,
        releasedAt: null, id: { not: current.id },
        slot: normalizedSlot === "UNIVERSAL_IR" ? { in: ["IR", "UNIVERSAL_IR"] } : normalizedSlot,
      },
      orderBy: [{ slotIndex: "asc" }, { id: "asc" }],
      include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } },
    });
    const requestedDestination = destinationEntryId ? occupants.find(({ id }) => id === destinationEntryId) : null;
    if (destinationEntryId && !requestedDestination) throw new Error("That destination roster position changed. Refresh and try again.");
    const occupiedIndexes = new Set(occupants.map(({ slotIndex }) => slotIndex));
    if (requestedIndex !== undefined && (requestedIndex > allowed || (requestedDestination
      ? requestedDestination.slotIndex !== requestedIndex : occupiedIndexes.has(requestedIndex)))) {
      throw new Error("That destination roster position changed. Refresh and try again.");
    }
    const openIndex = requestedIndex ?? firstOpenSlot(occupiedIndexes, allowed);
    const displaced = requestedDestination ?? (!openIndex ? occupants[0] : null);
    const targetIndex = displaced?.slotIndex ?? openIndex;
    if (!targetIndex) throw new Error("That roster position is full.");
    if (displaced?.lockedAt) throw new Error("The player occupying that destination is locked.");
    if (displaced && displaced.rosterId !== current.rosterId && !current.slot.startsWith("UNIVERSAL_") && current.slot !== "IR") {
      throw new Error("A cross-sport universal slot cannot displace a player into a sport-specific position. Free a universal slot first.");
    }
    const currentIsStarter = !["BENCH", "UNIVERSAL_BENCH", "UNIVERSAL_IR", "IR", "ROOKIE_OVERFLOW"].includes(current.slot);
    if (displaced && current.slot === "ROOKIE_OVERFLOW") throw new Error("Move rookie overflow into an empty legal slot or release a player first.");
    if (displaced && currentIsStarter) {
      const trusted = await getEligiblePositions({ playerId: displaced.playerId, sport: context.leagueSport.sport, seasonYear: context.leagueSport.season?.startYear ?? context.membership.league.seasonYear, asOf: decisionAt });
      const positions = trusted.positions.length ? trusted.positions : context.membership.league.isHistorical ? [] : displaced.player.gameStats[0]?.observedPositions ?? [];
      if (!fitsSlot(context.leagueSport.sport, current.slot, new Set(positions))) throw new Error(`The swap is invalid because ${displaced.player.displayName} cannot occupy ${current.slot}.`);
    }
    if (displaced && (current.slot === "UNIVERSAL_IR" || current.slot === "IR")) {
      const eligible = await irEligiblePlayers(tx, [displaced.playerId], decisionAt);
      if (!eligible.has(displaced.playerId)) throw new Error(`The swap is invalid because ${displaced.player.displayName} lacks verified IR eligibility.`);
    }
    const movedAt = new Date();
    const before = await currentCompliance(tx, current.teamId, movedAt);
    await tx.rosterEntry.update({ where: { id: current.id }, data: { slot: `__MOVE__${current.id}`, slotIndex: 1 } });
    if (displaced) {
      await tx.rosterEntry.update({ where: { id: displaced.id }, data: { slot: current.slot === "IR" ? "UNIVERSAL_IR" : current.slot, slotIndex: current.slotIndex } });
      await recordMove(tx, { entryId: displaced.id, leagueId, teamId: displaced.teamId, actorUserId: userId,
        fromSlot: displaced.slot, fromSlotIndex: displaced.slotIndex, toSlot: current.slot === "IR" ? "UNIVERSAL_IR" : current.slot,
        toSlotIndex: current.slotIndex, effectiveAt: movedAt, reason: "Atomic roster swap", key: `move:${displaced.id}:${movedAt.toISOString()}` });
    }
    const updated = await tx.rosterEntry.update({ where: { id: current.id }, data: { slot: normalizedSlot, slotIndex: targetIndex } });
    await recordMove(tx, { entryId: current.id, leagueId, teamId: current.teamId, actorUserId: userId,
      fromSlot: current.slot, fromSlotIndex: current.slotIndex, toSlot: normalizedSlot, toSlotIndex: targetIndex,
      effectiveAt: movedAt, reason: displaced ? "Atomic roster swap" : "Roster position change", key: `move:${current.id}:${movedAt.toISOString()}` });
    const after = await currentCompliance(tx, current.teamId, movedAt);
    if (after.state !== "COMPLIANT" && (before.state === "COMPLIANT" || after.violationCount >= before.violationCount)) {
      throw new Error("Roster moves must preserve compliance or reduce existing violations.");
    }
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function setComputerLineups(leagueId: string, requestedSport?: Sport | string, at = new Date()) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  await captureDueGameLineups(at);
  const league = await database.league.findUniqueOrThrow({ where: { id: leagueId } });
  const period = league.isHistorical
    ? await database.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId, sport: leagueSport.sport, number: Math.max(1, league.currentPeriod) } } })
    : await database.scoringPeriod.findFirst({ where: { leagueId, sport: leagueSport.sport, startsAt: { lte: at }, endsAt: { gte: at } } });
  const decisionAt = league.isHistorical ? period?.startsAt ?? at : at;
  const rosters = await database.fantasyRoster.findMany({ where: { leagueId, sport: leagueSport.sport, team: { isComputer: true } }, include: {
    entries: { where: { releasedAt: null, lockedAt: null }, orderBy: { player: { displayName: "asc" } }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false }, recordedAt: { lte: decisionAt } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } },
  } });
  let updated = 0;
  for (const roster of rosters) {
    const available = [] as { id: string; positions: Set<string> }[];
    for (const entry of roster.entries) {
      const trusted = await getEligiblePositions({ playerId: entry.playerId, sport: leagueSport.sport, seasonYear: leagueSport.season?.startYear ?? league.seasonYear, asOf: decisionAt });
      const positions = trusted.positions.length ? trusted.positions : league.isHistorical ? [] : entry.player.gameStats[0]?.observedPositions ?? [];
      available.push({ id: entry.id, positions: new Set(positions) });
    }
    const assignments = new Map<string, { slot: string; slotIndex: number }>();
    const slotCounts = new Map<string, number>();
    const orderedSlots = leagueSport.rosterSlots.map((slot, index) => ({ slot, index, breadth: slotRule(leagueSport.sport, slot).positions.length })).sort((a, b) => a.breadth - b.breadth || a.index - b.index);
    for (const { slot } of orderedSlots) {
      const index = available.findIndex((entry) => fitsSlot(leagueSport.sport, slot, entry.positions));
      if (index >= 0) {
        const slotIndex = (slotCounts.get(slot) ?? 0) + 1; slotCounts.set(slot, slotIndex);
        assignments.set(available.splice(index, 1)[0].id, { slot, slotIndex });
      }
    }
    let benchIndex = 0; const changedAt = new Date();
    await database.$transaction(async (tx) => {
      const changes = roster.entries.map((entry) => {
        const assigned = assignments.get(entry.id);
        return { entry, toSlot: assigned?.slot ?? "BENCH", toSlotIndex: assigned?.slotIndex ?? ++benchIndex };
      }).filter(({ entry, toSlot, toSlotIndex }) => entry.slot !== toSlot || entry.slotIndex !== toSlotIndex);
      for (const { entry } of changes) await tx.rosterEntry.update({ where: { id: entry.id }, data: { slot: `__MOVE__${entry.id}`, slotIndex: 1 } });
      for (const { entry, toSlot, toSlotIndex } of changes) {
        await tx.rosterEntry.update({ where: { id: entry.id }, data: { slot: toSlot, slotIndex: toSlotIndex } });
        await recordMove(tx, { entryId: entry.id, leagueId, teamId: entry.teamId, fromSlot: entry.slot, fromSlotIndex: entry.slotIndex,
          toSlot, toSlotIndex, effectiveAt: changedAt, reason: "Computer lineup optimization", key: `computer:${entry.id}:${changedAt.toISOString()}` });
      }
      await currentCompliance(tx, roster.teamId, changedAt);
    }, { isolationLevel: "Serializable" });
    updated += assignments.size;
  }
  return updated;
}
