import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { setCommissionerAuditContext } from "./commissioner-audit";
import { hasGameplayTable } from "./gameplay-storage";

const schema = z.object({ leagueSportId: z.uuid(), seasonId: z.uuid(), startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  playoffStartsAt: z.coerce.date().nullable(), playoffEndsAt: z.coerce.date().nullable(), matchupDays: z.number().int().min(1).max(28), reason: z.string().trim().min(10).max(1000) }).strict();
export async function configureFantasyWindow(userId: string, raw: z.input<typeof schema>, at = new Date()) {
  const value = schema.parse(raw);
  if (!await hasGameplayTable("FantasyWindowRevision")) throw new Error("Fantasy calendar controls await deployment of the reviewed lifecycle migration.");
  return getDatabase().$transaction(async (tx) => {
    const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: value.leagueSportId }, include: { league: { include: { members: { where: { userId } } } } } });
    if (sport.league.members[0]?.role !== "COMMISSIONER") throw new Error("Only the commissioner may configure fantasy scoring windows.");
    const assignment = await tx.leagueSportSeason.findUniqueOrThrow({ where: { leagueSportId_seasonId: { leagueSportId: sport.id, seasonId: value.seasonId } }, include: { competition: true } });
    if (assignment.competition && (assignment.competition.finalizedAt || await tx.scoringPeriod.count({ where: { competitionId: assignment.competition.id } }))) throw new Error("Configure the fantasy calendar before periods are provisioned; active and finalized periods cannot be rewritten.");
    const revision = await tx.professionalSeasonScheduleRevision.findFirst({ where: { seasonId: value.seasonId, retrievedAt: { lte: at } }, orderBy: { retrievedAt: "desc" } });
    if (revision?.status !== "AVAILABLE" || !revision.regularSeasonStartsAt || !revision.regularSeasonEndsAt) throw new Error("PENDING_DATA: verified professional regular-season bounds are required. Fantasy settings cannot fabricate them.");
    if (value.startsAt < revision.regularSeasonStartsAt || value.endsAt > revision.regularSeasonEndsAt || value.endsAt <= value.startsAt) throw new Error("Fantasy scoring must fit within the verified professional regular season.");
    if (sport.league.competitionType === "CUMULATIVE" && (value.playoffStartsAt || value.playoffEndsAt)) throw new Error("Cumulative fantasy windows cannot contain playoffs.");
    if (sport.league.competitionType === "HEAD_TO_HEAD" && (!value.playoffStartsAt || !value.playoffEndsAt || value.playoffStartsAt <= value.startsAt || value.playoffEndsAt > value.endsAt || value.playoffEndsAt <= value.playoffStartsAt)) throw new Error("Provide an explicit valid fantasy playoff window within the scoring bounds.");
    const previous = await tx.fantasyWindowRevision.findFirst({ where: { leagueSportId: sport.id, seasonId: value.seasonId }, orderBy: { version: "desc" } });
    const { reason, ...dates } = value;
    const window = await tx.fantasyWindowRevision.create({ data: { ...dates, version: (previous?.version ?? 0) + 1, actorUserId: userId, reason } });
    const tradeDeadlineAt = new Date(+(value.playoffStartsAt ?? value.endsAt) - 14 * 86400000);
    await setCommissionerAuditContext(tx, userId, "CONFIGURE_FANTASY_WINDOW", reason);
    await tx.leagueSportSeason.update({ where: { id: assignment.id }, data: { firstScoringAt: value.startsAt, scoringEndsAt: value.endsAt, playoffStartsAt: value.playoffStartsAt, playoffEndsAt: value.playoffEndsAt, tradeDeadlineAt, status: "ELIGIBLE", statusReason: "Commissioner fantasy calendar reconciled within verified professional boundaries." } });
    if (assignment.competition) await tx.sportCompetition.update({ where: { id: assignment.competition.id }, data: { regularSeasonStartsAt: value.startsAt, regularSeasonEndsAt: value.playoffStartsAt ?? value.endsAt, fantasyPlayoffStartsAt: value.playoffStartsAt, fantasyPlayoffEndsAt: value.playoffEndsAt } });
    await tx.commissionerAuditEvent.create({ data: { leagueId: sport.leagueId, actorUserId: userId, action: "CONFIGURE_FANTASY_WINDOW", targetType: "FantasyWindowRevision", targetId: window.id, sport: sport.sport, before: { revisionId: previous?.id ?? null }, after: { revisionId: window.id, version: window.version, tradeDeadlineAt: tradeDeadlineAt.toISOString() }, reason } });
    return window;
  }, { isolationLevel: "Serializable" });
}
