import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { defaultSlots } from "@/simulation/config";

export const sports = ["NFL", "NBA", "MLB", "NHL"] as const satisfies readonly Sport[];

export function seasonMetadata(sport: Sport, at = new Date()) {
  const year = at.getUTCFullYear();
  const startYear = sport === "NBA" || sport === "NHL" ? (at.getUTCMonth() >= 6 ? year : year - 1) : year;
  return { startYear, label: sport === "NBA" || sport === "NHL" ? `${startYear}-${String(startYear + 1).slice(-2)}` : String(startYear) };
}

const keeperLimitsSchema = z.partialRecord(z.enum(sports), z.coerce.number().int().min(0).max(50)).optional();
export const createLeagueSchema = z.object({
  name: z.string().trim().min(3).max(80), sports: z.array(z.enum(sports)).min(1).max(4).optional(), sport: z.enum(sports).optional(),
  seasonYear: z.coerce.number().int().min(2016).max(2100).optional(), maxTeams: z.coerce.number().int().min(2).max(16).default(12),
  format: z.enum(["REDRAFT", "DYNASTY"]).default("DYNASTY"), visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  keeperLimits: keeperLimitsSchema, startingFaab: z.coerce.number().int().min(0).max(100_000).default(100),
  benchSlots: z.coerce.number().int().min(0).max(20).default(5), historical: z.coerce.boolean().default(false), fillWithComputers: z.coerce.boolean().default(false),
}).transform((input) => ({ ...input, sports: [...new Set(input.sports ?? (input.sport ? [input.sport] : sports))] }));

function slug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "league";
  return `${base}-${randomBytes(4).toString("hex")}`;
}

async function ensureSeason(tx: Prisma.TransactionClient, sport: Sport, startYear: number) {
  const label = sport === "NBA" || sport === "NHL" ? `${startYear}-${String(startYear + 1).slice(-2)}` : String(startYear);
  return tx.season.upsert({ where: { sport_startYear: { sport, startYear } }, update: {}, create: {
    sport, startYear, label, coverageReason: "Automatically associated league season metadata; no authoritative live feed is connected.",
  } });
}

async function createSportRosters(tx: Prisma.TransactionClient, leagueId: string, teamId: string) {
  const leagueSports = await tx.leagueSport.findMany({ where: { leagueId } });
  await tx.fantasyRoster.createMany({ data: leagueSports.map((item) => ({
    leagueId, leagueSportId: item.id, teamId, sport: item.sport, faabRemaining: item.startingFaab,
  })), skipDuplicates: true });
}

export async function createLeague(userId: string, input: z.input<typeof createLeagueSchema>) {
  const value = createLeagueSchema.parse(input); const database = getDatabase();
  const preset = await database.scoringPreset.findUniqueOrThrow({ where: { version: "ubp-v9-experimental" } });
  return database.$transaction(async (tx) => {
    const seasons = new Map<Sport, Awaited<ReturnType<typeof ensureSeason>>>();
    for (const sport of value.sports) {
      const metadata = value.historical && value.seasonYear ? { startYear: value.seasonYear } : seasonMetadata(sport);
      seasons.set(sport, await ensureSeason(tx, sport, metadata.startYear));
    }
    const firstSport = value.sports[0];
    const league = await tx.league.create({ data: {
      slug: slug(value.name), name: value.name, format: value.format, visibility: value.visibility, maxTeams: value.maxTeams,
      isDemo: value.historical, isHistorical: value.historical, primarySport: firstSport, seasonYear: seasons.get(firstSport)!.startYear,
      startingFaab: value.startingFaab, benchSlots: value.benchSlots, rosterSlots: [...defaultSlots[firstSport]],
      draftRounds: defaultSlots[firstSport].length + value.benchSlots, playoffTeams: Math.min(4, value.maxTeams), presetId: preset.id,
    } });
    for (const sport of value.sports) {
      const season = seasons.get(sport)!;
      await tx.leagueSport.create({ data: {
        leagueId: league.id, sport, seasonId: season.id, seasonLabel: season.label, rosterSlots: [...defaultSlots[sport]],
        benchSlots: value.benchSlots, draftRounds: defaultSlots[sport].length + value.benchSlots, startingFaab: value.startingFaab,
        keeperLimit: value.format === "REDRAFT" ? value.keeperLimits?.[sport] ?? 0 : 0,
      } });
    }
    const membership = await tx.leagueMember.create({ data: { leagueId: league.id, userId, role: "COMMISSIONER" } });
    const team = await tx.fantasyTeam.create({ data: {
      leagueId: league.id, managerId: userId, membershipId: membership.id, name: "Commissioner's Franchise",
      faabRemaining: value.startingFaab, draftSlot: 1,
    } });
    await createSportRosters(tx, league.id, team.id);
    if (value.fillWithComputers) for (let index = 1; index < value.maxTeams; index++) {
      const computer = await tx.fantasyTeam.create({ data: {
        leagueId: league.id, name: `Computer ${index}`, isComputer: true, faabRemaining: value.startingFaab, draftSlot: index + 1,
      } });
      await createSportRosters(tx, league.id, computer.id);
    }
    return league;
  }, { isolationLevel: "Serializable" });
}

export async function createInvitation(userId: string, leagueId: string, email?: string) {
  const database = getDatabase(); const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (membership?.role !== "COMMISSIONER") throw new Error("Only the commissioner can create invitations.");
  const token = randomBytes(32).toString("base64url");
  await database.leagueInvitation.create({ data: {
    leagueId, createdById: userId, tokenHash: createHash("sha256").update(token).digest("hex"),
    email: email?.trim().toLowerCase() || null, expiresAt: new Date(Date.now() + 7 * 86_400_000),
  } });
  return token;
}

async function addMemberFranchise(tx: Prisma.TransactionClient, leagueId: string, userId: string) {
  const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId }, include: { teams: true } });
  if (await tx.leagueMember.count({ where: { leagueId } }) >= league.maxTeams) throw new Error("This league is full.");
  if (await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } })) throw new Error("You already belong to this league.");
  const membership = await tx.leagueMember.create({ data: { leagueId, userId } });
  const openComputer = await tx.fantasyTeam.findFirst({ where: { leagueId, isComputer: true }, orderBy: { draftSlot: "asc" } });
  if (openComputer) await tx.fantasyTeam.update({ where: { id: openComputer.id }, data: {
    managerId: userId, membershipId: membership.id, isComputer: false, name: `Franchise ${openComputer.draftSlot}`,
  } });
  else {
    const used = new Set(league.teams.map(({ draftSlot }) => draftSlot));
    const slot = Array.from({ length: league.maxTeams }, (_, index) => index + 1).find((value) => !used.has(value));
    if (!slot) throw new Error("This league has no open franchise slot.");
    const team = await tx.fantasyTeam.create({ data: {
      leagueId, managerId: userId, membershipId: membership.id, name: `Franchise ${slot}`,
      faabRemaining: league.startingFaab, draftSlot: slot,
    } });
    await createSportRosters(tx, leagueId, team.id);
  }
  return leagueId;
}

export async function joinLeague(userId: string, token: string) {
  const database = getDatabase(); const tokenHash = createHash("sha256").update(token).digest("hex");
  return database.$transaction(async (tx) => {
    const invitation = await tx.leagueInvitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new Error("This invitation is invalid or expired.");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (invitation.email && invitation.email !== user.email.toLowerCase()) throw new Error("This invitation was issued to another email address.");
    await addMemberFranchise(tx, invitation.leagueId, userId);
    await tx.leagueInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    return invitation.leagueId;
  }, { isolationLevel: "Serializable" });
}

export async function joinPublicLeague(userId: string, leagueId: string) {
  return getDatabase().$transaction(async (tx) => {
    const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId } });
    if (league.visibility !== "PUBLIC" || league.status !== "SETUP") throw new Error("This public league is not open for joining.");
    return addMemberFranchise(tx, leagueId, userId);
  }, { isolationLevel: "Serializable" });
}

export function listPublicLeagues(userId: string) {
  return getDatabase().league.findMany({ where: { visibility: "PUBLIC", status: "SETUP", members: { none: { userId } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100, select: {
      id: true, name: true, format: true, maxTeams: true, visibility: true, sports: { select: { sport: true } }, _count: { select: { members: true } },
    } });
}

export async function resizeLeague(userId: string, leagueId: string, maxTeams: number) {
  const size = z.number().int().min(2).max(16).parse(maxTeams); const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { _count: { select: { teams: true } } } } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can resize this league.");
  if (member.league.status !== "SETUP") throw new Error("League capacity can only change before drafting begins.");
  if (size < member.league._count.teams) throw new Error(`This league already has ${member.league._count.teams} franchises. Remove computer franchises or choose a capacity of at least ${member.league._count.teams}.`);
  return database.league.update({ where: { id: leagueId }, data: { maxTeams: size, playoffTeams: Math.min(member.league.playoffTeams, size) } });
}

export async function fillComputerFranchises(userId: string, leagueId: string) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { teams: true } } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can add computer franchises.");
    if (member.league.status !== "SETUP") throw new Error("Computer franchises can only be added before drafting begins.");
    const used = new Set(member.league.teams.map(({ draftSlot }) => draftSlot));
    for (let slot = 1; slot <= member.league.maxTeams; slot++) if (!used.has(slot)) {
      const team = await tx.fantasyTeam.create({ data: { leagueId, name: `Computer ${slot}`, isComputer: true, faabRemaining: member.league.startingFaab, draftSlot: slot } });
      await createSportRosters(tx, leagueId, team.id);
    }
  }, { isolationLevel: "Serializable" });
}

export async function removeComputerFranchise(userId: string, leagueId: string, teamId: string) {
  const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can remove computer franchises.");
  if (member.league.status !== "SETUP") throw new Error("Computer franchises can only be removed before drafting begins.");
  const team = await database.fantasyTeam.findFirst({ where: { id: teamId, leagueId, isComputer: true } });
  if (!team) throw new Error("That computer franchise is unavailable.");
  await database.fantasyTeam.delete({ where: { id: team.id } });
}

export async function leaveLeague(userId: string, leagueId: string) {
  const database = getDatabase(); return database.$transaction(async (tx) => {
    const membership = await tx.leagueMember.findUniqueOrThrow({ where: { leagueId_userId: { leagueId, userId } } });
    if (membership.role === "COMMISSIONER") throw new Error("Transfer commissioner responsibility before leaving.");
    const team = await tx.fantasyTeam.findUnique({ where: { membershipId: membership.id } });
    if (team && await tx.rosterEntry.count({ where: { teamId: team.id, releasedAt: null } })) throw new Error("A manager with rostered players cannot leave during play.");
    if (team) await tx.fantasyTeam.delete({ where: { id: team.id } }); await tx.leagueMember.delete({ where: { id: membership.id } });
  });
}

export async function leagueContext(userId: string, leagueId: string) {
  return getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: {
    fantasyTeam: { include: { sportRosters: { include: { entries: { where: { releasedAt: null }, include: { player: true } } } } } },
    league: { include: { sports: { orderBy: { sport: "asc" }, include: { season: true } }, teams: { orderBy: { draftSlot: "asc" }, include: { manager: true, sportRosters: true } }, drafts: { orderBy: { createdAt: "desc" } }, preset: { include: { rules: { orderBy: [{ sport: "asc" }, { statKey: "asc" }] } } } } },
  } });
}

export async function resolveLeagueSport(leagueId: string, requested?: string | null) {
  const value = requested ? z.enum(sports).parse(requested) : null;
  const items = await getDatabase().leagueSport.findMany({ where: { leagueId }, orderBy: { sport: "asc" }, include: { season: true } });
  if (!items.length) throw new Error("This league has no configured sports.");
  const selected = value ? items.find(({ sport }) => sport === value) : items[0];
  if (!selected) throw new Error("That sport is not included in this league.");
  return selected;
}

export async function updateTeamName(userId: string, leagueId: string, name: string) {
  const value = z.string().trim().min(3).max(60).parse(name);
  const membership = await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  return getDatabase().fantasyTeam.update({ where: { id: membership.fantasyTeam.id }, data: { name: value } });
}

export async function updateLeagueSettings(userId: string, leagueId: string, input: {
  sport?: Sport; draftSecondsPerPick: number; startingFaab: number; playoffTeams: number; playoffPeriods: number;
  visibility?: "PRIVATE" | "PUBLIC"; maxTeams?: number; keeperLimit?: number; keeperDeadline?: Date | null; draftRounds: number;
}) {
  const value = z.object({ sport: z.enum(sports).optional(), draftSecondsPerPick: z.number().int().min(15).max(600), startingFaab: z.number().int().min(0).max(100_000),
    playoffTeams: z.number().int().min(2).max(16), playoffPeriods: z.number().int().min(1).max(3), visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
    maxTeams: z.number().int().min(2).max(16).optional(), keeperLimit: z.number().int().min(0).max(50).optional(), keeperDeadline: z.date().nullable().optional(),
    draftRounds: z.number().int().min(1).max(50) }).parse(input);
  const database = getDatabase(); const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can update league settings.");
  if (value.playoffTeams > (value.maxTeams ?? member.league.maxTeams)) throw new Error("Playoff teams cannot exceed league teams.");
  if (value.maxTeams !== undefined && value.maxTeams !== member.league.maxTeams) await resizeLeague(userId, leagueId, value.maxTeams);
  const leagueSport = await resolveLeagueSport(leagueId, value.sport);
  await database.$transaction([
    database.league.update({ where: { id: leagueId }, data: { visibility: value.visibility, playoffTeams: value.playoffTeams, playoffPeriods: value.playoffPeriods } }),
    database.leagueSport.update({ where: { id: leagueSport.id }, data: { draftSecondsPerPick: value.draftSecondsPerPick,
      draftRounds: value.draftRounds, keeperLimit: member.league.format === "REDRAFT" ? value.keeperLimit : 0,
      keeperDeadline: member.league.format === "REDRAFT" ? value.keeperDeadline : null,
      ...(member.league.status === "SETUP" ? { startingFaab: value.startingFaab } : {}) } }),
  ]);
}

export async function updateDraftOrder(userId: string, leagueId: string, sport: Sport, teamIds: string[]) {
  const database = getDatabase(); const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { teams: true } } } });
  if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can configure draft order.");
  if (member.league.status !== "SETUP") throw new Error("Draft order can only change before drafting begins.");
  const expected = member.league.teams.map(({ id }) => id);
  if (teamIds.length !== expected.length || new Set(teamIds).size !== expected.length || teamIds.some((id) => !expected.includes(id))) throw new Error("Draft order must include every franchise exactly once.");
  return database.leagueSport.update({ where: { leagueId_sport: { leagueId, sport } }, data: { draftOrder: teamIds } });
}

export async function selectKeeper(userId: string, leagueId: string, sport: Sport, playerId: string) {
  const database = getDatabase();
  const member = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true, fantasyTeam: true } });
  if (!member?.fantasyTeam) throw new Error("You do not manage a franchise in this league.");
  if (member.league.format !== "REDRAFT") throw new Error("Keeper selections apply only to Redraft leagues.");
  const leagueSport = await resolveLeagueSport(leagueId, sport);
  if (!leagueSport.seasonId || leagueSport.keeperLimit < 1) throw new Error("Keepers are not enabled for this sport.");
  if (leagueSport.keeperDeadline && leagueSport.keeperDeadline <= new Date()) throw new Error("The keeper deadline has passed.");
  const roster = await database.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: member.fantasyTeam.id, leagueSportId: leagueSport.id } } });
  if (!await database.rosterEntry.findFirst({ where: { rosterId: roster.id, playerId, releasedAt: null } })) throw new Error("That player is not on your active sport roster.");
  if (await database.keeperSelection.count({ where: { rosterId: roster.id, seasonId: leagueSport.seasonId } }) >= leagueSport.keeperLimit) throw new Error("This sport's keeper limit is already filled.");
  return database.keeperSelection.create({ data: { leagueSportId: leagueSport.id, rosterId: roster.id, teamId: member.fantasyTeam.id, playerId, seasonId: leagueSport.seasonId } });
}

export async function transitionSportSeason(userId: string, leagueId: string, sport: Sport, nextStartYear: number) {
  const year = z.number().int().min(2016).max(2100).parse(nextStartYear); const database = getDatabase();
  return database.$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can transition seasons.");
    const leagueSport = await tx.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId, sport } } });
    const currentSeason = await tx.season.findUniqueOrThrow({ where: { id: leagueSport.seasonId } });
    if (year <= currentSeason.startYear) throw new Error("The next season must begin after the current sport season.");
    const season = await ensureSeason(tx, sport, year);
    if (member.league.format === "REDRAFT") {
      const keepers = leagueSport.seasonId ? await tx.keeperSelection.findMany({ where: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId } }) : [];
      const kept = new Set(keepers.map(({ playerId }) => playerId)); const active = await tx.rosterEntry.findMany({ where: { leagueId, sport, releasedAt: null } }); const now = new Date();
      for (const entry of active) {
        await tx.rosterEntry.update({ where: { id: entry.id }, data: { releasedAt: now, lockedAt: null } });
        if (kept.has(entry.playerId)) await tx.rosterEntry.create({ data: { leagueId, teamId: entry.teamId, rosterId: entry.rosterId, playerId: entry.playerId, sport, seasonId: season.id, slot: "BENCH" } });
      }
      if (keepers.length) await tx.keeperSelection.updateMany({ where: { id: { in: keepers.map(({ id }) => id) } }, data: { retainedAt: now } });
    }
    await tx.fantasyRoster.updateMany({ where: { leagueSportId: leagueSport.id }, data: { faabRemaining: leagueSport.startingFaab } });
    return tx.leagueSport.update({ where: { id: leagueSport.id }, data: { seasonId: season.id, seasonLabel: season.label } });
  }, { isolationLevel: "Serializable" });
}

export type Transaction = Prisma.TransactionClient;
