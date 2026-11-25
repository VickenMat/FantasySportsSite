import { createHash } from "node:crypto";
import { z } from "zod";
import type { CompetitionType, Prisma, Sport } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { setCommissionerAuditContext } from "./commissioner-audit";

const sports = ["NFL", "NBA", "MLB", "NHL"] as const satisfies readonly Sport[];
const DAY = 86_400_000;

export const scheduleSourceSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  sourceName: z.string().trim().min(1).max(200),
  sourceVersion: z.string().trim().min(1).max(100),
  retrievedAt: z.coerce.date(),
  seasons: z.array(z.object({
    sport: z.enum(sports), startYear: z.number().int().min(1900).max(2200), label: z.string().trim().min(1).max(30),
    status: z.enum(["AVAILABLE", "INCOMPLETE", "UNAVAILABLE"]), reason: z.string().trim().min(1).max(1000).optional(),
    regularSeasonStartsAt: z.coerce.date().optional(), regularSeasonEndsAt: z.coerce.date().optional(),
    postseasonStartsAt: z.coerce.date().optional(), postseasonEndsAt: z.coerce.date().optional(),
  }).superRefine((row, context) => {
    if (row.status === "AVAILABLE" && (!row.regularSeasonStartsAt || !row.regularSeasonEndsAt)) {
      context.addIssue({ code: "custom", message: "AVAILABLE schedules require regular-season start and end dates." });
    }
    if (row.regularSeasonStartsAt && row.regularSeasonEndsAt && row.regularSeasonStartsAt >= row.regularSeasonEndsAt) {
      context.addIssue({ code: "custom", message: "The regular-season end must follow its start." });
    }
    if (row.postseasonStartsAt && row.postseasonEndsAt && row.postseasonStartsAt >= row.postseasonEndsAt) {
      context.addIssue({ code: "custom", message: "The postseason end must follow its start." });
    }
  })).min(1),
});

export type ScheduleRevision = {
  id: string; status: "AVAILABLE" | "INCOMPLETE" | "UNAVAILABLE" | "PENDING_DATA"; retrievedAt: Date;
  regularSeasonStartsAt: Date | null; regularSeasonEndsAt: Date | null; postseasonStartsAt: Date | null; postseasonEndsAt: Date | null;
  season: { id: string; sport: Sport; startYear: number; label: string };
};

export type SportSchedulePreview = {
  sport: Sport; status: "AVAILABLE" | "PENDING_DATA" | "UNAVAILABLE"; reason: string; seasonId: string | null;
  scheduleRevisionId: string | null; seasonLabel: string | null; draftDeadlineAt: Date | null; firstScoringAt: Date | null;
  scoringEndsAt: Date | null; playoffStartsAt: Date | null; playoffEndsAt: Date | null; tradeDeadlineAt: Date | null;
  rolloverEligibleAt: Date | null; warnings: string[];
};

export function buildSchedulePreview(input: {
  sports: readonly Sport[]; draftCompleteBy: Date; competitionType: CompetitionType;
  fantasyPlayoffs?: Partial<Record<Sport, { startsAt: Date; endsAt: Date }>>;
}, revisions: readonly ScheduleRevision[]): SportSchedulePreview[] {
  return input.sports.map((sport) => {
    const currentBySeason = new Map<string, ScheduleRevision>();
    revisions.filter((item) => item.season.sport === sport).sort((a, b) => b.retrievedAt.getTime() - a.retrievedAt.getTime())
      .forEach((item) => { if (!currentBySeason.has(item.season.id)) currentBySeason.set(item.season.id, item); });
    const current = [...currentBySeason.values()];
    const selected = current.filter((item) => item.status === "AVAILABLE" && item.regularSeasonStartsAt && item.regularSeasonEndsAt
      && item.regularSeasonStartsAt > input.draftCompleteBy)
      .sort((a, b) => a.regularSeasonStartsAt!.getTime() - b.regularSeasonStartsAt!.getTime() || a.season.startYear - b.season.startYear)[0];
    if (!selected) {
      const explicitlyUnavailable = current.length > 0 && current.every((item) => item.status === "UNAVAILABLE");
      return { sport, status: explicitlyUnavailable ? "UNAVAILABLE" : "PENDING_DATA",
        reason: explicitlyUnavailable ? "The schedule source reports no eligible professional season." : "Awaiting a source-backed eligible professional season schedule.",
        seasonId: null, scheduleRevisionId: null, seasonLabel: null, draftDeadlineAt: null, firstScoringAt: null, scoringEndsAt: null,
        playoffStartsAt: null, playoffEndsAt: null, tradeDeadlineAt: null, rolloverEligibleAt: null, warnings: [] };
    }
    const warnings: string[] = [];
    const fantasy = input.competitionType === "HEAD_TO_HEAD" ? input.fantasyPlayoffs?.[sport] : undefined;
    if (fantasy && (fantasy.startsAt >= fantasy.endsAt || fantasy.startsAt <= selected.regularSeasonStartsAt! || fantasy.endsAt > selected.regularSeasonEndsAt!)) {
      throw new Error("Fantasy playoffs must fit inside the authoritative regular-season window.");
    }
    let tradeDeadlineAt: Date | null;
    if (input.competitionType === "CUMULATIVE") tradeDeadlineAt = new Date(selected.regularSeasonEndsAt!.getTime() - 14 * DAY);
    else if (fantasy) tradeDeadlineAt = new Date(fantasy.startsAt.getTime() - 14 * DAY);
    else {
      tradeDeadlineAt = null;
      warnings.push("Fantasy playoff dates and the head-to-head trade deadline are pending fantasy competition configuration. Professional postseason dates are not fantasy playoff dates.");
    }
    return { sport, status: "AVAILABLE", reason: "Eligible source-backed schedule found.", seasonId: selected.season.id,
      scheduleRevisionId: selected.id, seasonLabel: selected.season.label, draftDeadlineAt: selected.regularSeasonStartsAt,
      firstScoringAt: selected.regularSeasonStartsAt, scoringEndsAt: selected.regularSeasonEndsAt,
      playoffStartsAt: fantasy?.startsAt ?? null, playoffEndsAt: fantasy?.endsAt ?? null, tradeDeadlineAt,
      rolloverEligibleAt: selected.postseasonEndsAt ?? selected.regularSeasonEndsAt, warnings };
  });
}

export function selectNextSeasonRevision(sport: Sport, currentStartYear: number, revisions: readonly ScheduleRevision[]) {
  const latestBySeason = new Map<string, ScheduleRevision>();
  revisions.filter((item) => item.season.sport === sport).sort((a, b) => b.retrievedAt.getTime() - a.retrievedAt.getTime())
    .forEach((item) => { if (!latestBySeason.has(item.season.id)) latestBySeason.set(item.season.id, item); });
  return [...latestBySeason.values()].filter((item) => item.status === "AVAILABLE" && item.season.startYear > currentStartYear
    && item.regularSeasonStartsAt && item.regularSeasonEndsAt)
    .sort((a, b) => a.season.startYear - b.season.startYear || a.regularSeasonStartsAt!.getTime() - b.regularSeasonStartsAt!.getTime())[0] ?? null;
}

type ScheduleClient = Prisma.TransactionClient | ReturnType<typeof getDatabase>;

export async function previewLeagueScheduleWithClient(client: ScheduleClient, input: {
  sports: readonly Sport[]; draftCompleteBy: Date; competitionType: CompetitionType;
}) {
  const revisions = await client.professionalSeasonScheduleRevision.findMany({
    where: { season: { sport: { in: [...input.sports] } } }, include: { season: true }, orderBy: [{ retrievedAt: "desc" }, { importedAt: "desc" }],
  });
  return buildSchedulePreview(input, revisions);
}

export function previewLeagueSchedule(input: { sports: readonly Sport[]; draftCompleteBy: Date; competitionType: CompetitionType }) {
  return previewLeagueScheduleWithClient(getDatabase(), input);
}

export async function importProfessionalSchedules(raw: unknown) {
  const source = scheduleSourceSchema.parse(raw); const database = getDatabase();
  return database.$transaction(async (tx) => {
    let inserted = 0; let duplicates = 0;
    for (const row of source.seasons) {
      const season = await tx.season.upsert({ where: { sport_startYear: { sport: row.sport, startYear: row.startYear } }, update: {},
        create: { sport: row.sport, startYear: row.startYear, label: row.label, coverageReason: "Schedule metadata only; statistical coverage is independently verified." } });
      const sourceRecord = JSON.parse(JSON.stringify(row, (_key, value) => value instanceof Date ? value.toISOString() : value)) as Prisma.InputJsonValue;
      const contentHash = createHash("sha256").update(JSON.stringify(sourceRecord)).digest("hex");
      const exists = await tx.professionalSeasonScheduleRevision.findUnique({
        where: { seasonId_provider_contentHash: { seasonId: season.id, provider: source.provider, contentHash } }, select: { id: true },
      });
      if (exists) { duplicates++; continue; }
      await tx.professionalSeasonScheduleRevision.create({ data: {
        seasonId: season.id, status: row.status, provider: source.provider, sourceName: source.sourceName,
        sourceVersion: source.sourceVersion, contentHash, retrievedAt: source.retrievedAt,
        regularSeasonStartsAt: row.regularSeasonStartsAt, regularSeasonEndsAt: row.regularSeasonEndsAt,
        postseasonStartsAt: row.postseasonStartsAt, postseasonEndsAt: row.postseasonEndsAt, reason: row.reason, sourceRecord,
      } });
      inserted++;
    }
    return { inserted, duplicates, total: source.seasons.length };
  }, { isolationLevel: "Serializable" });
}

export async function assignNextSportSeason(userId: string, leagueId: string, sport: Sport) {
  const database = getDatabase();
  return database.$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } }, include: { league: true } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can assign a professional season.");
    const leagueSport = await tx.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId, sport } },
      include: { seasonAssignments: { include: { season: true, championshipCycle: true }, orderBy: { season: { startYear: "desc" } } } } });
    const current = leagueSport.seasonAssignments.find(({ seasonId }) => seasonId === leagueSport.seasonId);
    if (!current) throw new Error("The league sport has no current season assignment.");
    const cycleNumber = current.championshipCycle.number + 1;
    const prepared = leagueSport.seasonAssignments.find(({ championshipCycle, season }) =>
      championshipCycle.number === cycleNumber && season.startYear > current.season.startYear);
    if (prepared) return prepared;
    const revisions = await tx.professionalSeasonScheduleRevision.findMany({ where: { season: { sport, startYear: { gt: current.season.startYear } } }, include: { season: true }, orderBy: { retrievedAt: "desc" } });
    const next = selectNextSeasonRevision(sport, current.season.startYear, revisions);
    if (!next) throw new Error(`No source-backed ${sport} season follows ${current.season.label}.`);
    const existing = await tx.leagueSportSeason.findUnique({ where: { leagueSportId_seasonId: { leagueSportId: leagueSport.id, seasonId: next.season.id } } });
    if (existing) return existing;
    const cycle = await tx.championshipCycle.upsert({ where: { leagueId_number: { leagueId, number: cycleNumber } }, update: {},
      create: { leagueId, number: cycleNumber, label: `Cycle ${cycleNumber}`, startsAt: next.regularSeasonStartsAt,
        endsAt: next.postseasonEndsAt ?? next.regularSeasonEndsAt } });
    const [dates] = buildSchedulePreview({ sports: [sport], draftCompleteBy: new Date(0), competitionType: member.league.competitionType }, [next]);
    const pendingConfiguration = member.league.competitionType === "HEAD_TO_HEAD";
    await setCommissionerAuditContext(tx, userId, "ASSIGN_SPORT_SEASON", "Commissioner assigned the next source-backed sport season.");
    return tx.leagueSportSeason.create({ data: { leagueSportId: leagueSport.id, seasonId: next.season.id, championshipCycleId: cycle.id,
      scheduleRevisionId: next.id, status: pendingConfiguration ? "PENDING_CONFIGURATION" : "ELIGIBLE",
      statusReason: pendingConfiguration ? "The next cycle needs an immutable competition configuration and playoff periods." : dates.reason,
      draftDeadlineAt: dates.draftDeadlineAt, firstScoringAt: dates.firstScoringAt, scoringEndsAt: dates.scoringEndsAt,
      playoffStartsAt: dates.playoffStartsAt, playoffEndsAt: dates.playoffEndsAt, tradeDeadlineAt: dates.tradeDeadlineAt,
      rolloverEligibleAt: dates.rolloverEligibleAt } });
  }, { isolationLevel: "Serializable" });
}

export async function assignGameToLeagueCycle(leagueId: string, leagueSportSeasonId: string, gameId: string) {
  return getDatabase().$transaction(async (tx) => {
    const assignment = await tx.leagueSportSeason.findFirstOrThrow({ where: { id: leagueSportSeasonId, leagueSport: { leagueId } }, include: { season: true } });
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    if (game.seasonId !== assignment.seasonId || game.sport !== assignment.season.sport) throw new Error("The game does not belong to the assigned professional season.");
    const existing = await tx.leagueGameAssignment.findUnique({ where: { leagueId_gameId: { leagueId, gameId } } });
    if (existing) {
      if (existing.leagueSportSeasonId !== assignment.id || existing.championshipCycleId !== assignment.championshipCycleId) throw new Error("The game is already assigned to another championship cycle.");
      return existing;
    }
    return tx.leagueGameAssignment.create({ data: {
      leagueId, leagueSportSeasonId: assignment.id, championshipCycleId: assignment.championshipCycleId, gameId,
    } });
  }, { isolationLevel: "Serializable" });
}
