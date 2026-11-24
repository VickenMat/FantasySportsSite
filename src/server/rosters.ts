import { z } from "zod";
import type { Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { fitsSlot, slotRule } from "@/simulation/config";
import { resolveLeagueSport } from "./league";
import { getEligiblePositions } from "./positions";

async function managedRoster(userId: string, leagueId: string, requestedSport?: Sport | string) {
  const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
  const membership = await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true, league: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  const roster = await getDatabase().fantasyRoster.findUnique({ where: { teamId_leagueSportId: { teamId: membership.fantasyTeam.id, leagueSportId: leagueSport.id } } });
  if (!roster) throw new Error(`Your franchise has no ${leagueSport.sport} roster.`);
  return { membership, roster, leagueSport };
}

export async function addFreeAgent(userId: string, leagueId: string, playerId: string, sport?: Sport | string) {
  z.uuid().parse(playerId); const context = await managedRoster(userId, leagueId, sport); const database = getDatabase();
  return database.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.sport !== context.leagueSport.sport) throw new Error(`This player is not eligible for the ${context.leagueSport.sport} roster.`);
    const count = await tx.rosterEntry.count({ where: { rosterId: context.roster.id, releasedAt: null } });
    if (count >= context.leagueSport.rosterSlots.length + context.leagueSport.benchSlots) throw new Error("Your sport roster is full.");
    const entry = await tx.rosterEntry.create({ data: {
      leagueId, teamId: context.membership.fantasyTeam!.id, rosterId: context.roster.id, playerId,
      sport: context.leagueSport.sport, seasonId: context.leagueSport.seasonId, slot: "BENCH",
    } });
    await tx.fantasyTransaction.create({ data: {
      leagueId, leagueSportId: context.leagueSport.id, rosterId: context.roster.id, sport: context.leagueSport.sport,
      teamId: context.membership.fantasyTeam!.id, playerId, type: "ADD", note: "Free-agent add",
    } });
    return entry;
  }, { isolationLevel: "Serializable" });
}

export async function dropPlayer(userId: string, leagueId: string, playerId: string, sport?: Sport | string) {
  const context = await managedRoster(userId, leagueId, sport); const database = getDatabase();
  return database.$transaction(async (tx) => {
    const entry = await tx.rosterEntry.findFirst({ where: { rosterId: context.roster.id, playerId, releasedAt: null } });
    if (!entry) throw new Error("That player is not on your active sport roster.");
    if (entry.lockedAt) throw new Error("That roster slot is locked.");
    await tx.rosterEntry.update({ where: { id: entry.id }, data: { releasedAt: new Date(), slot: "BENCH" } });
    await tx.fantasyTransaction.create({ data: {
      leagueId, leagueSportId: context.leagueSport.id, rosterId: context.roster.id, sport: context.leagueSport.sport,
      teamId: entry.teamId, playerId, type: "DROP", note: "Player dropped",
    } });
  });
}

export async function setLineupSlot(userId: string, leagueId: string, rosterEntryId: string, slot: string, sport?: Sport | string) {
  const context = await managedRoster(userId, leagueId, sport); const normalizedSlot = z.string().trim().toUpperCase().max(20).parse(slot);
  const database = getDatabase();
  const entry = await database.rosterEntry.findUnique({ where: { id: rosterEntryId }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
  if (!entry || entry.rosterId !== context.roster.id || entry.releasedAt) throw new Error("That roster entry is unavailable.");
  if (entry.lockedAt) throw new Error("That roster slot is locked.");
  const now = new Date();
  const period = context.membership.league.isHistorical
    ? await database.scoringPeriod.findUnique({ where: { leagueId_sport_number: { leagueId, sport: context.leagueSport.sport, number: Math.max(1, context.membership.league.currentPeriod) } } })
    : await database.scoringPeriod.findFirst({ where: { leagueId, sport: context.leagueSport.sport, startsAt: { lte: now }, endsAt: { gte: now } } });
  const decisionAt = context.membership.league.isHistorical ? period?.startsAt ?? now : now;
  if (await database.game.findFirst({ where: { sport: context.leagueSport.sport, startsAt: { lte: decisionAt, gte: period?.startsAt }, gameStats: { some: { playerId: entry.playerId } } }, select: { id: true } })) {
    throw new Error("This player's game has started and the lineup slot is locked.");
  }
  if (normalizedSlot !== "BENCH") {
    const allowed = context.leagueSport.rosterSlots.filter((value) => value === normalizedSlot).length;
    if (!allowed) throw new Error(`That slot is not configured for this ${context.leagueSport.sport} roster.`);
    const trusted = await getEligiblePositions({ playerId: entry.playerId, sport: context.leagueSport.sport, seasonYear: context.leagueSport.season?.startYear ?? context.membership.league.seasonYear, asOf: decisionAt });
    const positions = trusted.positions.length ? trusted.positions : context.membership.league.isHistorical ? [] : entry.player.gameStats[0]?.observedPositions ?? [];
    if (!fitsSlot(context.leagueSport.sport, normalizedSlot, new Set(positions))) throw new Error("The player's recorded eligibility does not fit that slot.");
  }
  return database.$transaction(async (tx) => {
    const current = await tx.rosterEntry.findFirst({ where: { id: entry.id, rosterId: context.roster.id, releasedAt: null }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
    if (!current || current.lockedAt) throw new Error("That roster entry is no longer movable.");
    const allowed = normalizedSlot === "BENCH" ? Number.MAX_SAFE_INTEGER : context.leagueSport.rosterSlots.filter((value) => value === normalizedSlot).length;
    const occupants = await tx.rosterEntry.findMany({ where: { rosterId: context.roster.id, releasedAt: null, slot: normalizedSlot, id: { not: current.id } }, orderBy: { id: "asc" }, include: { player: { include: { gameStats: { where: { observedPositions: { isEmpty: false } }, orderBy: { recordedAt: "desc" }, take: 1 } } } } });
    const displaced = occupants.length >= allowed ? occupants[0] : null;
    if (displaced?.lockedAt) throw new Error("The player occupying that destination is locked.");
    if (displaced && current.slot !== "BENCH") {
      const trusted = await getEligiblePositions({ playerId: displaced.playerId, sport: context.leagueSport.sport, seasonYear: context.leagueSport.season?.startYear ?? context.membership.league.seasonYear, asOf: decisionAt });
      const positions = trusted.positions.length ? trusted.positions : context.membership.league.isHistorical ? [] : displaced.player.gameStats[0]?.observedPositions ?? [];
      if (!fitsSlot(context.leagueSport.sport, current.slot, new Set(positions))) throw new Error(`The swap is invalid because ${displaced.player.displayName} cannot occupy ${current.slot}.`);
    }
    if (displaced) await tx.rosterEntry.update({ where: { id: displaced.id }, data: { slot: current.slot } });
    return tx.rosterEntry.update({ where: { id: current.id }, data: { slot: normalizedSlot } });
  }, { isolationLevel: "Serializable" });
}

export async function setComputerLineups(leagueId: string, requestedSport?: Sport | string, at = new Date()) {
  const database = getDatabase(); const leagueSport = await resolveLeagueSport(leagueId, requestedSport);
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
    const assignments = new Map<string, string>();
    const orderedSlots = leagueSport.rosterSlots.map((slot, index) => ({ slot, index, breadth: slotRule(leagueSport.sport, slot).positions.length })).sort((a, b) => a.breadth - b.breadth || a.index - b.index);
    for (const { slot } of orderedSlots) {
      const index = available.findIndex((entry) => fitsSlot(leagueSport.sport, slot, entry.positions));
      if (index >= 0) assignments.set(available.splice(index, 1)[0].id, slot);
    }
    await database.$transaction(roster.entries.map((entry) => database.rosterEntry.update({ where: { id: entry.id }, data: { slot: assignments.get(entry.id) ?? "BENCH" } })));
    updated += assignments.size;
  }
  return updated;
}
