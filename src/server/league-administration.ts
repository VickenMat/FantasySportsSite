import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { defaultFixedBracket } from "./competition";
import { setCommissionerAuditContext } from "./commissioner-audit";

export async function transferFranchiseOwnership(userId: string, leagueId: string, teamId: string, email: string, reason: string) {
  z.string().trim().min(10).max(1000).parse(reason);
  z.email().parse(email);
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can transfer an abandoned franchise.");
    const team = await tx.fantasyTeam.findFirstOrThrow({ where: { id: teamId, leagueId } });
    if (team.membershipId === member.id) throw new Error("Commissioner succession requires explicit role transfer; choose another abandoned franchise.");
    const target = await tx.user.findUniqueOrThrow({ where: { email: email.trim().toLowerCase() } });
    if (await tx.fantasyTeam.findFirst({ where: { leagueId, managerId: target.id, id: { not: teamId } } })) throw new Error("This manager already controls a franchise in this league.");
    if (team.managerId === target.id) return team;
    const membership = await tx.leagueMember.upsert({ where: { leagueId_userId: { leagueId, userId: target.id } }, create: { leagueId, userId: target.id, role: "MANAGER" }, update: {} });
    const updated = await tx.fantasyTeam.update({ where: { id: team.id }, data: { managerId: target.id, membershipId: membership.id, isComputer: false } });
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "TRANSFER_FRANCHISE_OWNERSHIP", targetType: "FantasyTeam", targetId: teamId,
      before: { managerId: team.managerId, membershipId: team.membershipId, isComputer: team.isComputer }, after: { managerId: target.id, membershipId: membership.id }, reason } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

const futureSettings = z.object({
  playoffTeams: z.number().int().min(0).max(16), playoffWeeks: z.number().int().min(0).max(4),
  thirdPlaceEnabled: z.boolean(), consolationEnabled: z.boolean(),
  qualificationPoints: z.number().int().min(-100).max(100), championPoints: z.number().int().min(-100).max(100),
  runnerUpPoints: z.number().int().min(-100).max(100), thirdPlacePoints: z.number().int().min(-100).max(100),
  highestPfPoints: z.number().int().min(-100).max(100), lowestPfPoints: z.number().int().min(-100).max(100),
}).partial().strict();
export async function configureFutureCompetition(userId: string, leagueId: string, cycleId: string, raw: z.input<typeof futureSettings>, reason: string) {
  z.string().trim().min(10).max(1000).parse(reason);
  const settings = futureSettings.parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can configure future cycles.");
    const cycle = await tx.championshipCycle.findFirstOrThrow({ where: { id: cycleId, leagueId }, include: { sportSeasons: { include: { competition: true } } } });
    const sports = await tx.leagueSport.findMany({ where: { leagueId }, include: { seasonAssignments: { include: { championshipCycle: true } } } });
    const currentNumber = Math.max(...sports.flatMap((sport) => sport.seasonAssignments.filter(({ seasonId }) => seasonId === sport.seasonId).map(({ championshipCycle }) => championshipCycle.number)));
    if (cycle.number <= currentNumber || cycle.status !== "PLANNING" || cycle.sportSeasons.some(({ competition }) => competition?.finalizedAt)) throw new Error("Settings revisions apply only to a future planning cycle and never rewrite active or finalized competition.");
    const prior = await tx.competitionConfigSnapshot.findFirstOrThrow({ where: { leagueId }, orderBy: [{ championshipCycle: { number: "desc" } }, { version: "desc" }] });
    const { id: _id, createdAt: _createdAt, version: _version, championshipCycleId: _cycle, contentHash: _hash, ...base } = prior;
    void _id; void _createdAt; void _version; void _cycle; void _hash;
    const data = { ...base, ...settings };
    if (data.competitionType === "CUMULATIVE" && (data.playoffTeams || data.playoffWeeks)) throw new Error("Cumulative competition cannot create playoffs.");
    if (data.competitionType === "HEAD_TO_HEAD") defaultFixedBracket(sports.length ? (await tx.league.findUniqueOrThrow({ where: { id: leagueId } })).maxTeams : 0, data.playoffTeams);
    const last = await tx.competitionConfigSnapshot.findFirst({ where: { championshipCycleId: cycleId }, orderBy: { version: "desc" } });
    const snapshot = await tx.competitionConfigSnapshot.create({ data: { ...data, championshipCycleId: cycleId, version: (last?.version ?? 0) + 1, contentHash: createHash("sha256").update(JSON.stringify(data)).digest("hex") } });
    await setCommissionerAuditContext(tx, userId, "FUTURE_COMPETITION_SETTINGS", reason);
    await tx.sportCompetition.updateMany({ where: { leagueSportSeason: { championshipCycleId: cycleId }, finalizedAt: null, periods: { none: {} } }, data: { configSnapshotId: snapshot.id } });
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId: userId, action: "FUTURE_COMPETITION_SETTINGS", targetType: "ChampionshipCycle", targetId: cycleId,
      before: { snapshotId: last?.id ?? null }, after: { snapshotId: snapshot.id, version: snapshot.version, settings }, reason } });
    return snapshot;
  }, { isolationLevel: "Serializable" });
}
