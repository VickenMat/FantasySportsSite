import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { CompetitionType, LeagueStatus, Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { defaultSlots } from "@/simulation/config";
import { setCommissionerAuditContext } from "@/server/commissioner-audit";
import { previewLeagueScheduleWithClient, type SportSchedulePreview } from "@/server/scheduling";

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
  competitionType: z.enum(["HEAD_TO_HEAD", "CUMULATIVE"]).default("HEAD_TO_HEAD"), draftCompleteBy: z.coerce.date().optional(),
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
    const scheduleBySport = new Map<Sport, SportSchedulePreview>();
    if (!value.historical) {
      const previews = await previewLeagueScheduleWithClient(tx, {
        sports: value.sports, draftCompleteBy: value.draftCompleteBy ?? new Date(), competitionType: value.competitionType as CompetitionType,
      });
      for (const preview of previews) scheduleBySport.set(preview.sport, preview);
    }
    for (const sport of value.sports) {
      const preview = scheduleBySport.get(sport);
      if (preview?.seasonId) seasons.set(sport, await tx.season.findUniqueOrThrow({ where: { id: preview.seasonId } }));
      else {
        const metadata = value.historical && value.seasonYear ? { startYear: value.seasonYear } : seasonMetadata(sport);
        seasons.set(sport, await ensureSeason(tx, sport, metadata.startYear));
      }
    }
    const firstSport = value.sports[0];
    const defaultPlayoffTeams = value.maxTeams >= 6 ? 6 : value.maxTeams % 2 ? value.maxTeams - 1 : value.maxTeams;
    const defaultPlayoffWeeks = defaultPlayoffTeams > 4 ? 3 : defaultPlayoffTeams > 2 ? 2 : 1;
    const league = await tx.league.create({ data: {
      slug: slug(value.name), name: value.name, format: value.format, competitionType: value.competitionType, visibility: value.visibility, maxTeams: value.maxTeams,
      isDemo: value.historical, isHistorical: value.historical, primarySport: firstSport, seasonYear: seasons.get(firstSport)!.startYear,
      startingFaab: value.startingFaab, benchSlots: value.benchSlots, rosterSlots: [...defaultSlots[firstSport]],
      draftRounds: defaultSlots[firstSport].length + value.benchSlots, playoffTeams: value.competitionType === "CUMULATIVE" ? 0 : defaultPlayoffTeams,
      playoffPeriods: value.competitionType === "CUMULATIVE" ? 0 : defaultPlayoffWeeks, presetId: preset.id,
    } });
    const leagueSports = new Map<Sport, { id: string }>();
    for (const sport of value.sports) {
      const season = seasons.get(sport)!;
      const leagueSport = await tx.leagueSport.create({ data: {
        leagueId: league.id, sport, seasonId: season.id, seasonLabel: season.label, rosterSlots: [...defaultSlots[sport]],
        benchSlots: value.benchSlots, draftRounds: defaultSlots[sport].length + value.benchSlots, startingFaab: value.startingFaab,
        keeperLimit: value.format === "REDRAFT" ? value.keeperLimits?.[sport] ?? 0 : 0,
      } });
      leagueSports.set(sport, leagueSport);
    }
    const available = [...scheduleBySport.values()].filter((item) => item.status === "AVAILABLE");
    const starts = available.flatMap((item) => item.firstScoringAt ? [item.firstScoringAt] : []);
    const ends = available.flatMap((item) => item.rolloverEligibleAt ? [item.rolloverEligibleAt] : []);
    const cycle = await tx.championshipCycle.create({ data: { leagueId: league.id, number: 1, label: "Cycle 1",
      startsAt: starts.length ? new Date(Math.min(...starts.map(Number))) : null,
      endsAt: ends.length ? new Date(Math.max(...ends.map(Number))) : null } });
    const competitionConfig = { competitionType: value.competitionType, playoffTeams: value.competitionType === "CUMULATIVE" ? 0 : defaultPlayoffTeams,
      playoffWeeks: value.competitionType === "CUMULATIVE" ? 0 : defaultPlayoffWeeks, fixedBracket: true, thirdPlaceEnabled: true,
      consolationEnabled: true, qualificationPoints: 1, championPoints: 5, runnerUpPoints: 2, thirdPlacePoints: 1,
      highestPfPoints: 3, lowestPfPoints: -3,
      standingsTiebreakers: ["RECORD", "REGULAR_PF", "HEAD_TO_HEAD", "REGULAR_PA", "RECORDED_DRAW"],
      playoffTiebreakers: ["MATCHUP_UBP", "HEAD_TO_HEAD", "REGULAR_PF", "ORIGINAL_SEED"],
      overallTiebreakers: value.competitionType === "CUMULATIVE"
        ? ["COMBINED_UBP", "FIRST_PLACE_FINISHES", "SECOND_PLACE_FINISHES", "THIRD_PLACE_FINISHES", "RECORDED_DRAW"]
        : ["CHAMPIONSHIP_POINTS", "COMBINED_UBP", "SPORT_CHAMPIONSHIPS", "RUNNER_UP_FINISHES", "THIRD_PLACE_FINISHES", "RECORDED_DRAW"] };
    const configSnapshot = await tx.competitionConfigSnapshot.create({ data: { leagueId: league.id, championshipCycleId: cycle.id, version: 1,
      ...competitionConfig, contentHash: createHash("sha256").update(JSON.stringify(competitionConfig)).digest("hex") } });
    for (const sport of value.sports) {
      const preview = scheduleBySport.get(sport); const season = seasons.get(sport)!;
      const assignment = await tx.leagueSportSeason.create({ data: {
        leagueSportId: leagueSports.get(sport)!.id, seasonId: season.id, championshipCycleId: cycle.id,
        scheduleRevisionId: preview?.scheduleRevisionId ?? null, status: preview?.status === "AVAILABLE" ? "ELIGIBLE" : "PENDING_DATA",
        statusReason: preview?.reason ?? (value.historical ? "Historical replay scheduling is separate from competitive season scheduling." : "Awaiting a source-backed professional season schedule."),
        draftDeadlineAt: preview?.draftDeadlineAt, firstScoringAt: preview?.firstScoringAt, scoringEndsAt: preview?.scoringEndsAt,
        playoffStartsAt: preview?.playoffStartsAt, playoffEndsAt: preview?.playoffEndsAt, tradeDeadlineAt: preview?.tradeDeadlineAt,
        rolloverEligibleAt: preview?.rolloverEligibleAt,
      } });
      await tx.sportCompetition.create({ data: { leagueId: league.id, leagueSportSeasonId: assignment.id, configSnapshotId: configSnapshot.id,
        sport, status: "PENDING_DATA", statusReason: "Authoritative UTC professional game schedule is required before competition periods can be generated.",
        regularSeasonStartsAt: preview?.firstScoringAt, regularSeasonEndsAt: preview?.scoringEndsAt } });
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
  const size = z.number().int().min(2).max(16).parse(maxTeams);
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { _count: { select: { teams: true } } } } },
    });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can resize this league.");
    validateLeagueResize(member.league.status, member.league._count.teams, size);
    await setCommissionerAuditContext(tx, userId, "RESIZE_LEAGUE", "Commissioner changed franchise capacity.");
    return tx.league.update({ where: { id: leagueId }, data: { maxTeams: size, playoffTeams: Math.min(member.league.playoffTeams, size) } });
  }, { isolationLevel: "Serializable" });
}

function validateLeagueResize(status: LeagueStatus, teams: number, size: number) {
  if (status !== "SETUP") throw new Error("League capacity can only change before drafting begins.");
  if (size < teams) throw new Error(`This league already has ${teams} franchises. Remove computer franchises or choose a capacity of at least ${teams}.`);
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
    playoffTeams: z.number().int().min(0).max(16), playoffPeriods: z.number().int().min(0).max(3), visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
    maxTeams: z.number().int().min(2).max(16).optional(), keeperLimit: z.number().int().min(0).max(50).optional(), keeperDeadline: z.date().nullable().optional(),
    draftRounds: z.number().int().min(1).max(50) }).parse(input);
  await getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      include: { league: { include: { _count: { select: { teams: true } } } } },
    });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can update league settings.");
    const { league } = member;
    const size = value.maxTeams ?? league.maxTeams;
    if (size !== league.maxTeams) validateLeagueResize(league.status, league._count.teams, size);
    if (league.competitionType === "HEAD_TO_HEAD" && (value.playoffTeams < 2 || value.playoffPeriods < 1 || value.playoffTeams > size)) {
      throw new Error("Configure at least two playoff teams and one playoff round within the league capacity.");
    }
    if (league.competitionType === "CUMULATIVE" && (value.playoffTeams || value.playoffPeriods)) {
      throw new Error("Cumulative leagues have no fantasy playoffs.");
    }
    const leagueSport = await tx.leagueSport.findFirstOrThrow({
      where: { leagueId, sport: value.sport }, orderBy: { sport: "asc" }, select: { id: true },
    });
    await setCommissionerAuditContext(tx, userId, "UPDATE_GAMEPLAY_SETTINGS", "Commissioner saved gameplay settings.");
    await tx.league.update({ where: { id: leagueId }, data: {
      maxTeams: size, visibility: value.visibility, playoffTeams: value.playoffTeams, playoffPeriods: value.playoffPeriods,
    } });
    await tx.leagueSport.update({ where: { id: leagueSport.id }, data: {
      draftSecondsPerPick: value.draftSecondsPerPick, draftRounds: value.draftRounds,
      keeperLimit: league.format === "REDRAFT" ? value.keeperLimit : 0,
      keeperDeadline: league.format === "REDRAFT" ? value.keeperDeadline : null,
      startingFaab: league.status === "SETUP" ? value.startingFaab : undefined,
    } });
  }, { isolationLevel: "Serializable" });
}

export async function updateDraftOrder(userId: string, leagueId: string, sport: Sport, teamIds: string[]) {
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } }, include: { league: { include: { teams: true } } },
    });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can configure draft order.");
    if (member.league.status !== "SETUP") throw new Error("Draft order can only change before drafting begins.");
    const expected = member.league.teams.map(({ id }) => id);
    if (teamIds.length !== expected.length || new Set(teamIds).size !== expected.length || teamIds.some((id) => !expected.includes(id))) {
      throw new Error("Draft order must include every franchise exactly once.");
    }
    await setCommissionerAuditContext(tx, userId, "UPDATE_DRAFT_ORDER", "Commissioner set the sport draft order.");
    return tx.leagueSport.update({ where: { leagueId_sport: { leagueId, sport } }, data: { draftOrder: teamIds } });
  }, { isolationLevel: "Serializable" });
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
    if (!member.league.isHistorical) throw new Error("Competitive rollover requires an authoritative next-season assignment and finalized results.");
    const leagueSport = await tx.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId, sport } } });
    const currentSeason = await tx.season.findUniqueOrThrow({ where: { id: leagueSport.seasonId } });
    if (year <= currentSeason.startYear) throw new Error("The next season must begin after the current sport season.");
    const season = await ensureSeason(tx, sport, year);
    if (member.league.format === "REDRAFT") {
      const keepers = leagueSport.seasonId ? await tx.keeperSelection.findMany({ where: { leagueSportId: leagueSport.id, seasonId: leagueSport.seasonId } }) : [];
      const kept = new Set(keepers.map(({ playerId }) => playerId)); const active = await tx.rosterEntry.findMany({ where: { leagueId, sport, releasedAt: null } }); const now = new Date();
      const nextBenchIndex = new Map<string, number>();
      for (const entry of active) {
        await tx.rosterEntry.update({ where: { id: entry.id }, data: { releasedAt: now, lockedAt: null } });
        await tx.rosterAssignmentEvent.create({ data: { leagueId, teamId: entry.teamId, rosterEntryId: entry.id, actorUserId: userId,
          fromSlot: entry.slot, fromSlotIndex: entry.slotIndex, toSlot: "RELEASED", toSlotIndex: 1, effectiveAt: now,
          reason: "Redraft sport rollover", idempotencyKey: `redraft-release:${season.id}:${entry.id}` } });
        if (kept.has(entry.playerId)) {
          const slotIndex = (nextBenchIndex.get(entry.rosterId) ?? 0) + 1; nextBenchIndex.set(entry.rosterId, slotIndex);
          if (slotIndex > leagueSport.benchSlots) throw new Error("Keeper selections exceed the next season's sport bench capacity.");
          const retained = await tx.rosterEntry.create({ data: { leagueId, teamId: entry.teamId, rosterId: entry.rosterId, playerId: entry.playerId,
            sport, seasonId: season.id, slot: "BENCH", slotIndex, acquiredAt: now } });
          await tx.rosterAssignmentEvent.create({ data: { leagueId, teamId: entry.teamId, rosterEntryId: retained.id, actorUserId: userId,
            toSlot: "BENCH", toSlotIndex: slotIndex, effectiveAt: now, reason: "Redraft keeper retention",
            idempotencyKey: `redraft-keeper:${season.id}:${entry.id}` } });
        }
      }
      if (keepers.length) await tx.keeperSelection.updateMany({ where: { id: { in: keepers.map(({ id }) => id) } }, data: { retainedAt: now } });
    }
    await tx.fantasyRoster.updateMany({ where: { leagueSportId: leagueSport.id }, data: { faabRemaining: leagueSport.startingFaab } });
    await setCommissionerAuditContext(tx, userId, "TRANSITION_SPORT_SEASON", "Commissioner advanced the sport season.");
    return tx.leagueSport.update({ where: { id: leagueSport.id }, data: { seasonId: season.id, seasonLabel: season.label } });
  }, { isolationLevel: "Serializable" });
}

export type Transaction = Prisma.TransactionClient;
