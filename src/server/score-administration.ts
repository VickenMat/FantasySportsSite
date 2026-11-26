import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { periodPublicationTime } from "./competition-scoring";

const correction = z.object({ requestId: z.uuid(), periodId: z.uuid(), teamId: z.uuid(), deltaTenths: z.number().int().safe().refine((n) => n !== 0, "Enter a nonzero signed correction."), reason: z.string().trim().min(10).max(1000) }).strict();
/** Compensating entries reverse a correction; neither source scores nor captured lineups are rewritten. */
export async function correctPeriodScore(userId: string, leagueId: string, raw: z.input<typeof correction>, at = new Date()) {
  const value = correction.parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can correct competitive scores.");
    const previous = await tx.commissionerAuditEvent.findUnique({ where: { id: value.requestId } });
    const after = { teamId: value.teamId, deltaTenths: value.deltaTenths };
    if (previous) {
      if (previous.leagueId !== leagueId || previous.actorUserId !== userId || previous.targetId !== value.periodId || previous.action !== "CORRECT_PERIOD_SCORE" || (previous.after as { teamId?: string }).teamId !== after.teamId || (previous.after as { deltaTenths?: number }).deltaTenths !== after.deltaTenths) throw new Error("This correction request ID belongs to different terms.");
      return previous;
    }
    const period = await tx.scoringPeriod.findFirstOrThrow({ where: { id: value.periodId, leagueId }, include: { competition: true, matchups: true } });
    if (!period.competition) throw new Error("This control requires a source-backed competitive scoring period.");
    if (period.competition.finalizedAt || period.matchups.some(({ finalizedAt }) => finalizedAt)) throw new Error("Finalized competition is frozen. A correction cannot silently rewrite advancement or championship awards.");
    const publication = await periodPublicationTime(tx, period.id, at);
    if (publication && +at >= +publication + 86400000) throw new Error("The source-backed competitive correction window has closed.");
    if (!await tx.gameLineupSnapshot.count({ where: { scoringPeriodId: period.id, teamId: value.teamId, leagueId, isStarter: true, lockedAt: { lte: at } } })) throw new Error("Choose a participating franchise with a captured starter in this period.");
    const earlier = await tx.commissionerAuditEvent.findMany({ where: { leagueId, action: "CORRECT_PERIOD_SCORE", targetId: period.id } });
    const priorAdjustment = earlier.reduce((sum, entry) => {
      const terms = entry.after as { teamId: string; deltaTenths: number };
      return terms.teamId === value.teamId ? sum + BigInt(terms.deltaTenths) : sum;
    }, 0n);
    return tx.commissionerAuditEvent.create({ data: { id: value.requestId, leagueId, actorUserId: userId, action: "CORRECT_PERIOD_SCORE", targetType: "ScoringPeriod", targetId: period.id, sport: period.sport, before: { teamId: value.teamId, totalCorrectionTenths: priorAdjustment.toString() }, after: { ...after, totalCorrectionTenths: (priorAdjustment + BigInt(value.deltaTenths)).toString() }, effectiveAt: at, reason: value.reason } });
  }, { isolationLevel: "Serializable" });
}
