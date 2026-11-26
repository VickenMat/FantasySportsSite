"use server";
import { correctLastDraftSelection, undoLastDraftSelection } from "@/server/draft-corrections";
import { correctPeriodScore } from "@/server/score-administration";
import { configureFantasyWindow } from "@/server/fantasy-windows";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { archiveFranchise, configureFutureCompetition, transferFranchiseOwnership } from "@/server/league-administration";
import { assignNextSportSeason } from "@/server/scheduling";
import { sports, transitionSportSeason } from "@/server/league";
import { z } from "zod";

export async function administerLeague(leagueId: string, operation: "ASSIGN" | "ROLLOVER" | "FUTURE_SETTINGS" | "OWNERSHIP" | "WINDOW" | "ARCHIVE" | "SCORE" | "DRAFT_UNDO" | "DRAFT_CORRECT", _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    if (operation === "DRAFT_UNDO") await undoLastDraftSelection(user.id, leagueId, String(form.get("draftId")), String(form.get("reason")));
    else if (operation === "DRAFT_CORRECT") await correctLastDraftSelection(user.id, leagueId, String(form.get("draftId")), String(form.get("playerId")), String(form.get("reason")));
    else if (operation === "SCORE") await correctPeriodScore(user.id, leagueId, { requestId: String(form.get("requestId")), periodId: String(form.get("periodId")), teamId: String(form.get("teamId")), deltaTenths: Number(form.get("deltaTenths")), reason: String(form.get("reason")) });
    else if (operation === "ARCHIVE") await archiveFranchise(user.id, leagueId, String(form.get("teamId")), String(form.get("reason")));
    else if (operation === "WINDOW") {
      const instant = (name: string) => form.get(name) ? new Date(String(form.get(name)) + "Z") : null;
      await configureFantasyWindow(user.id, { leagueSportId: String(form.get("leagueSportId")), seasonId: String(form.get("seasonId")), startsAt: instant("startsAt")!, endsAt: instant("endsAt")!, playoffStartsAt: instant("playoffStartsAt"), playoffEndsAt: instant("playoffEndsAt"), matchupDays: Number(form.get("matchupDays")), reason: String(form.get("reason")) });
    } else if (operation === "OWNERSHIP") await transferFranchiseOwnership(user.id, leagueId, String(form.get("teamId")), String(form.get("email")), String(form.get("reason")));
    else if (operation === "FUTURE_SETTINGS") await configureFutureCompetition(user.id, leagueId, String(form.get("cycleId")), { playoffTeams: Number(form.get("playoffTeams")), playoffWeeks: Number(form.get("playoffWeeks")), thirdPlaceEnabled: form.get("thirdPlaceEnabled") === "on", consolationEnabled: form.get("consolationEnabled") === "on" }, String(form.get("reason")));
    else {
      const sport = z.enum(sports).parse(form.get("sport"));
      if (operation === "ASSIGN") await assignNextSportSeason(user.id, leagueId, sport);
      else await transitionSportSeason(user.id, leagueId, sport, Number(form.get("startYear")));
    }
    revalidatePath(`/leagues/${leagueId}`, "layout"); return "Administrative action recorded. Review the league audit for the exact changes.";
  } catch (error) { return error instanceof Error ? error.message : "The administrative action could not complete."; }
}
