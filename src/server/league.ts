import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { defaultSlots } from "@/simulation/config";

export const createLeagueSchema = z.object({
  name: z.string().trim().min(3).max(80),
  sport: z.enum(["NFL", "MLB", "NBA", "NHL"]),
  seasonYear: z.coerce.number().int().min(2016).max(2100),
  maxTeams: z.coerce.number().int().min(4).max(16).default(12),
  format: z.enum(["REDRAFT", "DYNASTY"]).default("REDRAFT"),
  startingFaab: z.coerce.number().int().min(0).max(100_000).default(100),
  benchSlots: z.coerce.number().int().min(0).max(20).default(5),
  historical: z.coerce.boolean().default(false),
  fillWithComputers: z.coerce.boolean().default(false),
});

function slug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "league";
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export async function createLeague(userId: string, input: z.input<typeof createLeagueSchema>) {
  const value = createLeagueSchema.parse(input);
  const database = getDatabase();
  const preset = await database.scoringPreset.findUniqueOrThrow({ where: { version: "ubp-v9-experimental" } });
  return database.$transaction(async (tx) => {
    const league = await tx.league.create({ data: {
      slug: slug(value.name), name: value.name, format: value.format, maxTeams: value.maxTeams,
      isDemo: value.historical, isHistorical: value.historical, primarySport: value.sport,
      seasonYear: value.seasonYear, startingFaab: value.startingFaab, benchSlots: value.benchSlots,
      rosterSlots: [...defaultSlots[value.sport]], draftRounds: defaultSlots[value.sport].length + value.benchSlots,
      presetId: preset.id, sports: { create: { sport: value.sport } },
    } });
    const membership = await tx.leagueMember.create({ data: { leagueId: league.id, userId, role: "COMMISSIONER" } });
    await tx.fantasyTeam.create({ data: {
      leagueId: league.id, managerId: userId, membershipId: membership.id,
      name: "Commissioner's Team", faabRemaining: value.startingFaab, draftSlot: 1,
    } });
    if (value.fillWithComputers) {
      await tx.fantasyTeam.createMany({ data: Array.from({ length: value.maxTeams - 1 }, (_, index) => ({
        leagueId: league.id, name: `Computer ${index + 1}`, isComputer: true,
        faabRemaining: value.startingFaab, draftSlot: index + 2,
      })) });
    }
    return league;
  });
}

export async function createInvitation(userId: string, leagueId: string, email?: string) {
  const database = getDatabase();
  const membership = await database.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
  if (membership?.role !== "COMMISSIONER") throw new Error("Only the commissioner can create invitations.");
  const token = randomBytes(32).toString("base64url");
  await database.leagueInvitation.create({ data: {
    leagueId, createdById: userId, tokenHash: createHash("sha256").update(token).digest("hex"),
    email: email?.trim().toLowerCase() || null, expiresAt: new Date(Date.now() + 7 * 86_400_000),
  } });
  return token;
}

export async function joinLeague(userId: string, token: string) {
  const database = getDatabase();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return database.$transaction(async (tx) => {
    const invitation = await tx.leagueInvitation.findUnique({ where: { tokenHash }, include: { league: true } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new Error("This invitation is invalid or expired.");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (invitation.email && invitation.email !== user.email.toLowerCase()) throw new Error("This invitation was issued to another email address.");
    const count = await tx.leagueMember.count({ where: { leagueId: invitation.leagueId } });
    if (count >= invitation.league.maxTeams) throw new Error("This league is full.");
    const prior = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: invitation.leagueId, userId } } });
    if (prior) throw new Error("You already belong to this league.");
    const membership = await tx.leagueMember.create({ data: { leagueId: invitation.leagueId, userId } });
    const openComputer = await tx.fantasyTeam.findFirst({ where: { leagueId: invitation.leagueId, isComputer: true }, orderBy: { draftSlot: "asc" } });
    if (openComputer) {
      await tx.fantasyTeam.update({ where: { id: openComputer.id }, data: { managerId: userId, membershipId: membership.id, isComputer: false, name: "New Team" } });
    } else {
      const slot = await tx.fantasyTeam.count({ where: { leagueId: invitation.leagueId } }) + 1;
      await tx.fantasyTeam.create({ data: {
        leagueId: invitation.leagueId, managerId: userId, membershipId: membership.id,
        name: `Team ${slot}`, faabRemaining: invitation.league.startingFaab, draftSlot: slot,
      } });
    }
    await tx.leagueInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    return invitation.leagueId;
  }, { isolationLevel: "Serializable" });
}

export async function leaveLeague(userId: string, leagueId: string) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const membership = await tx.leagueMember.findUniqueOrThrow({ where: { leagueId_userId: { leagueId, userId } } });
    if (membership.role === "COMMISSIONER") throw new Error("Transfer commissioner responsibility before leaving.");
    const team = await tx.fantasyTeam.findUnique({ where: { membershipId: membership.id } });
    if (team && await tx.rosterEntry.count({ where: { teamId: team.id } })) throw new Error("A manager with rostered players cannot leave during play.");
    if (team) await tx.fantasyTeam.delete({ where: { id: team.id } });
    await tx.leagueMember.delete({ where: { id: membership.id } });
  });
}

export async function leagueContext(userId: string, leagueId: string) {
  return getDatabase().leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    include: { fantasyTeam: true, league: {
      include: { sports: true, teams: { orderBy: { draftSlot: "asc" }, include: { manager: true } },
        drafts: { orderBy: { createdAt: "desc" }, take: 1 }, preset: true },
    } },
  });
}

export async function updateTeamName(userId: string, leagueId: string, name: string) {
  const value = z.string().trim().min(3).max(60).parse(name);
  const membership = await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { fantasyTeam: true } });
  if (!membership?.fantasyTeam) throw new Error("You do not manage a team in this league.");
  return getDatabase().fantasyTeam.update({ where: { id: membership.fantasyTeam.id }, data: { name: value } });
}

export type Transaction = Prisma.TransactionClient;
