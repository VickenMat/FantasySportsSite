"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { actionNotice } from "@/lib/action-notice";
import { autoPick, changeQueue, createDraft, makePick, queuePlayer, reorderQueue, setDraftPaused } from "@/server/draft";
import { createInvitation, createLeague, fillComputerFranchises, joinLeague, joinPublicLeague, removeComputerFranchise, resizeLeague, selectKeeper, transitionSportSeason, updateDraftOrder, updateLeagueSettings, updateTeamName } from "@/server/league";
import { advanceHistoricalPeriod, generateNextPlayoffRound, generateSchedule, recalculateMatchups } from "@/server/matchups";
import { cancelWaiver, processWaivers, submitWaiver } from "@/server/waivers";
import { addFreeAgent, dropPlayer, setLineupSlot } from "@/server/rosters";
import { enforceRateLimit } from "@/server/rate-limit";
import { cancelTrade, proposeTrade, respondToTrade } from "@/server/trades";

const limit = (userId: string, action: string, maximum = 60) => enforceRateLimit(userId, action, maximum, 60_000);
const sports = ["NFL", "NBA", "MLB", "NHL"] as const;
type LeagueSport = (typeof sports)[number];
const sportValue = (value: FormDataEntryValue | null): LeagueSport | undefined =>
  sports.includes(String(value) as LeagueSport) ? String(value) as LeagueSport : undefined;

export async function createLeagueAction(form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "create-league", 10);
  const league = await createLeague(user.id, {
    name: String(form.get("name") ?? ""), sports: form.getAll("sports").map(String) as ("NFL" | "NBA" | "MLB" | "NHL")[],
    seasonYear: form.get("seasonYear") || undefined, maxTeams: form.get("maxTeams"),
    format: String(form.get("format") ?? "DYNASTY") as "DYNASTY", visibility: String(form.get("visibility") ?? "PRIVATE") as "PRIVATE",
    keeperLimits: Object.fromEntries(sports.map((sport) => [sport, Number(form.get(`keeper_${sport}`) ?? 0)])) as Record<LeagueSport, number>,
    startingFaab: form.get("startingFaab"), benchSlots: form.get("benchSlots"),
    historical: form.get("historical") === "on", fillWithComputers: form.get("fillWithComputers") === "on",
  });
  await actionNotice("League created successfully.");
  redirect(`/leagues/${league.id}`);
}

export async function joinLeagueAction(token: string) {
  const { user } = await requireSession();
  await limit(user.id, "join-league", 20);
  redirect(`/leagues/${await joinLeague(user.id, token)}`);
}

export async function inviteAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "invite", 20);
  const token = await createInvitation(user.id, leagueId, String(form.get("email") ?? ""));
  redirect(`/leagues/${leagueId}/settings?invite=${encodeURIComponent(token)}`);
}

export async function renameTeamAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "team-rename", 20);
  await updateTeamName(user.id, leagueId, String(form.get("name") ?? ""));
  await actionNotice("Franchise name updated.");
  revalidatePath(`/leagues/${leagueId}`);
}

export async function startDraftAction(leagueId: string, form?: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "draft-start", 10);
  const draft = await createDraft(user.id, leagueId, String(form?.get("sport") ?? "") || undefined);
  await actionNotice(`${draft.sport} draft started.`);
  redirect(`/leagues/${leagueId}/draft?sport=${draft.sport}&draft=${draft.id}`);
}

export async function pickAction(leagueId: string, draftId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "draft-pick", 120);
  await makePick({ userId: user.id, draftId, playerId: String(form.get("playerId")) });
  await actionNotice("Draft selection confirmed.");
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function autoPickAction(leagueId: string, draftId: string) {
  const { user } = await requireSession();
  await limit(user.id, "draft-autopick", 120);
  await autoPick(user.id, draftId);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function queuePlayerAction(leagueId: string, draftId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "draft-queue", 120);
  await queuePlayer(user.id, draftId, String(form.get("playerId")));
  await actionNotice("Player added to your private queue.");
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function changeQueueAction(leagueId: string, draftId: string, entryId: string, operation: "UP" | "DOWN" | "REMOVE") {
  const { user } = await requireSession();
  await limit(user.id, "draft-queue", 120);
  await changeQueue(user.id, draftId, entryId, operation);
  await actionNotice(operation === "REMOVE" ? "Player removed from your queue." : "Queue order updated.");
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function reorderQueueAction(leagueId: string, draftId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "draft-queue", 120);
  await reorderQueue(user.id, draftId, form.getAll("entryId").map(String));
  await actionNotice("Queue order saved.");
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function waiverAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "waiver-submit", 60);
  await submitWaiver(user.id, {
    leagueId, sport: String(form.get("sport") ?? "") || undefined, addPlayerId: String(form.get("addPlayerId")), dropPlayerId: String(form.get("dropPlayerId") || "") || null,
    bid: Number(form.get("bid")),
  });
  await actionNotice("Private waiver claim submitted.");
  revalidatePath(`/leagues/${leagueId}/waivers`);
}

export async function processWaiversAction(leagueId: string, form?: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "waiver-process", 20);
  await processWaivers(user.id, leagueId, new Date(), String(form?.get("sport") ?? "") || undefined);
  revalidatePath(`/leagues/${leagueId}/waivers`);
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function cancelWaiverAction(leagueId: string, claimId: string) {
  const { user } = await requireSession(); await limit(user.id, "waiver-cancel", 60);
  await cancelWaiver(user.id, claimId); revalidatePath(`/leagues/${leagueId}/waivers`);
  await actionNotice("Waiver claim cancelled.");
}

export async function scheduleAction(leagueId: string, form?: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "schedule", 10);
  await generateSchedule(user.id, leagueId, 14, String(form?.get("sport") ?? "") || undefined);
  revalidatePath(`/leagues/${leagueId}/matchups`);
}

export async function recalculateAction(leagueId: string, form?: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "matchup-recalculate", 20);
  await recalculateMatchups(user.id, leagueId, String(form?.get("sport") ?? "") || undefined);
  revalidatePath(`/leagues/${leagueId}/matchups`);
  revalidatePath(`/leagues/${leagueId}/standings`);
}

export async function addPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "free-agent-add", 60);
  await addFreeAgent(user.id, leagueId, String(form.get("playerId")), String(form.get("sport") ?? "") || undefined);
  await actionNotice("Player added to your roster.");
  revalidatePath(`/leagues/${leagueId}/players`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function dropPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "roster-drop", 60);
  await dropPlayer(user.id, leagueId, String(form.get("playerId")), String(form.get("sport") ?? "") || undefined);
  await actionNotice("Player released from your roster.");
  revalidatePath(`/leagues/${leagueId}/players`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function lineupAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "lineup", 120);
  await setLineupSlot(user.id, leagueId, String(form.get("entryId")), String(form.get("slot")), String(form.get("sport") ?? "") || undefined, String(form.get("destinationEntryId") ?? "") || null);
  await actionNotice("Roster positions updated.");
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function advanceReplayAction(leagueId: string, form?: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "replay-advance", 20);
  await advanceHistoricalPeriod(user.id, leagueId, String(form?.get("sport") ?? "") || undefined);
  revalidatePath(`/leagues/${leagueId}/matchups`); revalidatePath(`/leagues/${leagueId}/standings`);
}

export async function draftPauseAction(leagueId: string, draftId: string, paused: boolean) {
  const { user } = await requireSession(); await limit(user.id, "draft-control", 30);
  await setDraftPaused(user.id, draftId, paused); revalidatePath(`/leagues/${leagueId}/draft`);
  await actionNotice(paused ? "Draft paused." : "Draft resumed with its saved time remaining.");
}

export async function leagueSettingsAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "league-settings", 20);
  await updateLeagueSettings(user.id, leagueId, {
    sport: sportValue(form.get("sport")),
    draftSecondsPerPick: Number(form.get("draftSecondsPerPick")), startingFaab: Number(form.get("startingFaab")),
    playoffTeams: Number(form.get("playoffTeams")), playoffPeriods: Number(form.get("playoffPeriods")),
    maxTeams: Number(form.get("maxTeams")), visibility: String(form.get("visibility") ?? "PRIVATE") as "PRIVATE",
    keeperLimit: Number(form.get("keeperLimit") ?? 0), draftRounds: Number(form.get("draftRounds")),
    keeperDeadline: form.get("keeperDeadline") ? new Date(String(form.get("keeperDeadline"))) : null,
  });
  await actionNotice("League settings saved.");
  revalidatePath(`/leagues/${leagueId}/settings`);
}

export async function draftOrderAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "draft-order", 20); const sport = sportValue(form.get("sport"));
  if (!sport) throw new Error("A valid sport is required.");
  await updateDraftOrder(user.id, leagueId, sport, form.getAll("teamId").map(String)); revalidatePath(`/leagues/${leagueId}/settings`);
}

export async function proposeTradeAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "trade-propose", 30);
  await proposeTrade(user.id, {
    leagueId, sport: String(form.get("sport") ?? "") || undefined, recipientTeamId: String(form.get("recipientTeamId")),
    offerPlayerIds: form.getAll("offerPlayerIds").map(String), requestPlayerIds: form.getAll("requestPlayerIds").map(String),
    proposerCutPlayerIds: form.getAll("proposerCutPlayerIds").map(String),
    message: String(form.get("message") ?? ""), expiresInHours: Number(form.get("expiresInHours") ?? 48),
  });
  await actionNotice("Trade proposal sent.");
  revalidatePath(`/leagues/${leagueId}/trades`);
}

export async function respondTradeAction(leagueId: string, tradeId: string, response: "ACCEPT" | "REJECT", form?: FormData) {
  const { user } = await requireSession(); await limit(user.id, "trade-respond", 30);
  await respondToTrade(user.id, tradeId, response, form?.getAll("cutPlayerIds").map(String) ?? []); revalidatePath(`/leagues/${leagueId}/trades`); revalidatePath(`/leagues/${leagueId}/team`);
  await actionNotice(response === "ACCEPT" ? "Trade accepted and processed atomically." : "Trade rejected.");
}

export async function cancelTradeAction(leagueId: string, tradeId: string) {
  const { user } = await requireSession(); await limit(user.id, "trade-cancel", 30);
  await cancelTrade(user.id, tradeId); revalidatePath(`/leagues/${leagueId}/trades`);
  await actionNotice("Trade proposal cancelled.");
}

export async function playoffsAction(leagueId: string, form?: FormData) {
  const { user } = await requireSession(); await limit(user.id, "playoffs", 10);
  await generateNextPlayoffRound(user.id, leagueId, String(form?.get("sport") ?? "") || undefined); revalidatePath(`/leagues/${leagueId}/matchups`);
}

export async function joinPublicLeagueAction(leagueId: string) {
  const { user } = await requireSession(); await limit(user.id, "join-public-league", 20);
  redirect(`/leagues/${await joinPublicLeague(user.id, leagueId)}`);
}

export async function resizeLeagueAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "league-resize", 20);
  await resizeLeague(user.id, leagueId, Number(form.get("maxTeams"))); revalidatePath(`/leagues/${leagueId}`);
}

export async function fillComputersAction(leagueId: string) {
  const { user } = await requireSession(); await limit(user.id, "computer-fill", 10);
  await fillComputerFranchises(user.id, leagueId); revalidatePath(`/leagues/${leagueId}`);
}

export async function removeComputerAction(leagueId: string, teamId: string) {
  const { user } = await requireSession(); await limit(user.id, "computer-remove", 30);
  await removeComputerFranchise(user.id, leagueId, teamId); revalidatePath(`/leagues/${leagueId}`);
}

export async function selectKeeperAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "keeper-select", 30);
  const sport = sportValue(form.get("sport"));
  if (!sport) throw new Error("A valid sport is required.");
  await selectKeeper(user.id, leagueId, sport, String(form.get("playerId"))); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function transitionSeasonAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "season-transition", 10);
  const sport = sportValue(form.get("sport"));
  if (!sport) throw new Error("A valid sport is required.");
  await transitionSportSeason(user.id, leagueId, sport, Number(form.get("startYear"))); revalidatePath(`/leagues/${leagueId}`);
}
