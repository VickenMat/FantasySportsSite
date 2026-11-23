"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { autoPick, createDraft, makePick, queuePlayer } from "@/server/draft";
import { createInvitation, createLeague, joinLeague, updateTeamName } from "@/server/league";
import { advanceHistoricalPeriod, generateSchedule, recalculateMatchups } from "@/server/matchups";
import { processWaivers, submitWaiver } from "@/server/waivers";
import { addFreeAgent, dropPlayer, setLineupSlot } from "@/server/rosters";

export async function createLeagueAction(form: FormData) {
  const { user } = await requireSession();
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
  redirect(`/leagues/${await joinLeague(user.id, token)}`);
}

export async function inviteAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  const token = await createInvitation(user.id, leagueId, String(form.get("email") ?? ""));
  redirect(`/leagues/${leagueId}/settings?invite=${encodeURIComponent(token)}`);
}

export async function renameTeamAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await updateTeamName(user.id, leagueId, String(form.get("name") ?? ""));
  revalidatePath(`/leagues/${leagueId}`);
}

export async function startDraftAction(leagueId: string) {
  const { user } = await requireSession();
  const draft = await createDraft(user.id, leagueId);
  redirect(`/leagues/${leagueId}/draft?draft=${draft.id}`);
}

export async function pickAction(leagueId: string, draftId: string, form: FormData) {
  const { user } = await requireSession();
  await makePick({ userId: user.id, draftId, playerId: String(form.get("playerId")) });
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function autoPickAction(leagueId: string, draftId: string) {
  const { user } = await requireSession();
  await autoPick(user.id, draftId);
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function queuePlayerAction(leagueId: string, draftId: string, form: FormData) {
  const { user } = await requireSession();
  await queuePlayer(user.id, draftId, String(form.get("playerId")));
  revalidatePath(`/leagues/${leagueId}/draft`);
}

export async function waiverAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await submitWaiver(user.id, {
    leagueId, addPlayerId: String(form.get("addPlayerId")), dropPlayerId: String(form.get("dropPlayerId") || "") || null,
    bid: Number(form.get("bid")),
  });
  revalidatePath(`/leagues/${leagueId}/waivers`);
}

export async function processWaiversAction(leagueId: string) {
  const { user } = await requireSession();
  await processWaivers(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/waivers`);
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function scheduleAction(leagueId: string) {
  const { user } = await requireSession();
  await generateSchedule(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/matchups`);
}

export async function recalculateAction(leagueId: string) {
  const { user } = await requireSession();
  await recalculateMatchups(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/matchups`);
  revalidatePath(`/leagues/${leagueId}/standings`);
}

export async function addPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await addFreeAgent(user.id, leagueId, String(form.get("playerId")));
  revalidatePath(`/leagues/${leagueId}/players`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function dropPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await dropPlayer(user.id, leagueId, String(form.get("playerId")));
  revalidatePath(`/leagues/${leagueId}/players`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function lineupAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await setLineupSlot(user.id, leagueId, String(form.get("entryId")), String(form.get("slot")));
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function advanceReplayAction(leagueId: string) {
  const { user } = await requireSession();
  await advanceHistoricalPeriod(user.id, leagueId);
  revalidatePath(`/leagues/${leagueId}/matchups`); revalidatePath(`/leagues/${leagueId}/standings`);
}
