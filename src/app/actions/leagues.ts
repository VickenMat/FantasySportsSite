"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { autoPick, createDraft, makePick, queuePlayer, setDraftPaused } from "@/server/draft";
import { createInvitation, createLeague, joinLeague, updateLeagueSettings, updateTeamName } from "@/server/league";
import { advanceHistoricalPeriod, generateNextPlayoffRound, generateSchedule, recalculateMatchups } from "@/server/matchups";
import { processWaivers, submitWaiver } from "@/server/waivers";
import { addFreeAgent, dropPlayer, setLineupSlot } from "@/server/rosters";
import { enforceRateLimit } from "@/server/rate-limit";
import { cancelTrade, proposeTrade, respondToTrade } from "@/server/trades";

const limit = (userId: string, action: string, maximum = 60) => enforceRateLimit(userId, action, maximum, 60_000);

export async function createLeagueAction(form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "create-league", 10);
  const league = await createLeague(user.id, {
    name: String(form.get("name") ?? ""), sport: String(form.get("sport") ?? "NFL") as "NFL",
    seasonYear: form.get("seasonYear"), maxTeams: form.get("maxTeams"),
    format: String(form.get("format") ?? "REDRAFT") as "REDRAFT",
    startingFaab: form.get("startingFaab"), benchSlots: form.get("benchSlots"),
    historical: form.get("historical") === "on", fillWithComputers: form.get("fillWithComputers") === "on",
  });
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
  revalidatePath(`/leagues/${leagueId}`);
}

export async function startDraftAction(leagueId: string) {
  const { user } = await requireSession();
  await limit(user.id, "draft-start", 10);
  const draft = await createDraft(user.id, leagueId);
  redirect(`/leagues/${leagueId}/draft?draft=${draft.id}`);
}

export async function pickAction(leagueId: string, draftId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "draft-pick", 120);
  await makePick({ userId: user.id, draftId, playerId: String(form.get("playerId")) });
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
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function waiverAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "waiver-submit", 60);
  await submitWaiver(user.id, {
    leagueId, addPlayerId: String(form.get("addPlayerId")), dropPlayerId: String(form.get("dropPlayerId") || "") || null,
    bid: Number(form.get("bid")),
  });
  revalidatePath(`/leagues/${leagueId}/waivers`);
}

export async function processWaiversAction(leagueId: string) {
  const { user } = await requireSession();
  await limit(user.id, "waiver-process", 20);
  await processWaivers(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/waivers`);
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function scheduleAction(leagueId: string) {
  const { user } = await requireSession();
  await limit(user.id, "schedule", 10);
  await generateSchedule(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/matchups`);
}

export async function recalculateAction(leagueId: string) {
  const { user } = await requireSession();
  await limit(user.id, "matchup-recalculate", 20);
  await recalculateMatchups(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/matchups`);
  revalidatePath(`/leagues/${leagueId}/standings`);
}

export async function addPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "free-agent-add", 60);
  await addFreeAgent(user.id, leagueId, String(form.get("playerId")));
  revalidatePath(`/leagues/${leagueId}/players`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function dropPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "roster-drop", 60);
  await dropPlayer(user.id, leagueId, String(form.get("playerId")));
  revalidatePath(`/leagues/${leagueId}/players`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function lineupAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "lineup", 120);
  await setLineupSlot(user.id, leagueId, String(form.get("entryId")), String(form.get("slot")));
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function advanceReplayAction(leagueId: string) {
  const { user } = await requireSession();
  await limit(user.id, "replay-advance", 20);
  await advanceHistoricalPeriod(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/matchups`); revalidatePath(`/leagues/${leagueId}/standings`);
}

export async function draftPauseAction(leagueId: string, draftId: string, paused: boolean) {
  const { user } = await requireSession(); await limit(user.id, "draft-control", 30);
  await setDraftPaused(user.id, draftId, paused); revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function leagueSettingsAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "league-settings", 20);
  await updateLeagueSettings(user.id, leagueId, {
    draftSecondsPerPick: Number(form.get("draftSecondsPerPick")), startingFaab: Number(form.get("startingFaab")),
    playoffTeams: Number(form.get("playoffTeams")), playoffPeriods: Number(form.get("playoffPeriods")),
  });
  revalidatePath(`/leagues/${leagueId}/settings`);
}

export async function proposeTradeAction(leagueId: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "trade-propose", 30);
  await proposeTrade(user.id, {
    leagueId, recipientTeamId: String(form.get("recipientTeamId")),
    offerPlayerIds: form.getAll("offerPlayerIds").map(String), requestPlayerIds: form.getAll("requestPlayerIds").map(String),
    message: String(form.get("message") ?? ""), expiresInHours: Number(form.get("expiresInHours") ?? 48),
  });
  revalidatePath(`/leagues/${leagueId}/trades`);
}

export async function respondTradeAction(leagueId: string, tradeId: string, response: "ACCEPT" | "REJECT") {
  const { user } = await requireSession(); await limit(user.id, "trade-respond", 30);
  await respondToTrade(user.id, tradeId, response); revalidatePath(`/leagues/${leagueId}/trades`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function cancelTradeAction(leagueId: string, tradeId: string) {
  const { user } = await requireSession(); await limit(user.id, "trade-cancel", 30);
  await cancelTrade(user.id, tradeId); revalidatePath(`/leagues/${leagueId}/trades`);
}

export async function playoffsAction(leagueId: string) {
  const { user } = await requireSession(); await limit(user.id, "playoffs", 10);
  await generateNextPlayoffRound(user.id, leagueId); revalidatePath(`/leagues/${leagueId}/matchups`);
}
