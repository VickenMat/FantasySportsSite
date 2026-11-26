"use server";
import { draftTimeCandidates } from "@/lib/draft-time";

import { cookies } from "next/headers";
import { waiverFunds } from "@/server/faab";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { actionNotice } from "@/lib/action-notice";
import { getDatabase } from "@/lib/db";
import { autoPick, changeQueue, createDraft, makePick, queuePlayer, reorderQueue, setDraftPaused } from "@/server/draft";
import { createInvitation, createLeague, fillComputerFranchises, joinLeague, joinPublicLeague, removeComputerFranchise, resizeLeague, resolveLeagueSport, selectKeeper, transitionSportSeason, updateDraftOrder, updateLeagueSettings, updateTeamName } from "@/server/league";
import { advanceHistoricalPeriod, generateNextPlayoffRound, generateSchedule, recalculateMatchups } from "@/server/matchups";
import { advanceSportPlayoffs } from "@/server/playoffs";
import { provisionFutureDraftPicks, transferFuturePick } from "@/server/dynasty-picks";
import { configureRookieDraftPlan } from "@/server/rookie-draft-plans";
import { cancelWaiver, processWaivers, submitWaiver } from "@/server/waivers";
import { addFreeAgent, dropPlayer, setLineupSlot } from "@/server/rosters";
import { enforceRateLimit } from "@/server/rate-limit";
import { cancelTrade, proposeTrade, respondToTrade } from "@/server/trades";
import { provisionCompetitionSchedule } from "@/server/competition";
import { commissionerRelease } from "@/server/roster-administration";
import { configureDraftPlan } from "@/server/draft-plans";
import { nominateAuction, placeAuctionBid } from "@/server/auctions";
import { configureFinancePolicy } from "@/server/finance";

export async function financePolicyAction(leagueId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    await configureFinancePolicy(user.id, leagueId, { salaryMode: form.get("mode") === "SALARY", scope: String(form.get("scope")) as "SPORT", amount: form.get("amount") ? Number(form.get("amount")) : undefined });
    revalidatePath(`/leagues/${leagueId}`, "layout"); return "Financial format configured. Set up your auction through the Draft tab.";
  } catch (error) { return error instanceof Error ? error.message : "Financial configuration failed."; }
}
export async function nominateAuctionAction(leagueId: string, leagueSportId: string, playerId: string, draftId: string | null) {
  const { user } = await requireSession();
  try { await nominateAuction(user.id, { leagueId, leagueSportId, playerId, ...(draftId ? { draftId } : {}) }); revalidatePath(`/leagues/${leagueId}`, "layout"); return "Auction nominated and minimum bid reserved."; }
  catch (error) { return error instanceof Error ? error.message : "Nomination failed."; }
}
export async function bidAuctionAction(leagueId: string, auctionId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try { await placeAuctionBid(user.id, auctionId, Number(form.get("maximum"))); revalidatePath(`/leagues/${leagueId}`, "layout"); return "Bid reserved."; }
  catch (error) { return error instanceof Error ? error.message : "Bid failed."; }
}

export async function configureDraftAction(leagueId: string, leagueSportId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    const sport = await getDatabase().leagueSport.findFirstOrThrow({ where: { id: leagueSportId, leagueId } });
    if (String(form.get("seasonId")) !== sport.seasonId) throw new Error("The selected season changed. Refresh the draft center.");
    const candidates = draftTimeCandidates(String(form.get("draftDate")), String(form.get("draftTime")), String(form.get("timezone")));
    const instant = candidates[Number(form.get("occurrence") ?? 0)];
    if (!instant || instant !== String(form.get("scheduledAt"))) throw new Error("Choose a valid draft date, time and timezone.");
    await configureDraftPlan(user.id, { leagueId, leagueSportId, method: String(form.get("method")) as "SNAKE", orderMethod: String(form.get("orderMethod")) as "CUSTOM",
      scope: String(form.get("scope") ?? "SPORT") as "SPORT" | "UNIVERSAL", order: JSON.parse(String(form.get("order"))), rounds: Number(form.get("rounds")), secondsPerPick: Number(form.get("secondsPerPick")),
      scheduledAt: form.get("scheduledAt") ? String(form.get("scheduledAt")) : null, timezone: String(form.get("timezone")), regenerate: form.get("regenerate") === "true",
      expectedVersion: Number(form.get("version")) || undefined });
    revalidatePath(`/leagues/${leagueId}`, "layout"); return "Draft order and schedule saved for every league member.";
  } catch (error) { return error instanceof Error ? error.message : "Draft configuration could not be saved."; }
}

export async function commissionerReleaseAction(leagueId: string, entryId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    await commissionerRelease(user.id, leagueId, entryId, String(form.get("reason")));
    revalidatePath(`/leagues/${leagueId}`); return "Release recorded. Automatic draft recovery checks the corrected roster every minute.";
  } catch (error) { return error instanceof Error ? error.message : "Unable to release player."; }
}

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
    maxTeams: form.get("maxTeams"),
    format: String(form.get("format") ?? "DYNASTY") as "DYNASTY", visibility: String(form.get("visibility") ?? "PRIVATE") as "PRIVATE",
    competitionType: String(form.get("competitionType") ?? "HEAD_TO_HEAD") as "HEAD_TO_HEAD", seasonOffset: form.get("seasonOffset") ?? 0,
    keeperLimits: Object.fromEntries(sports.map((sport) => [sport, Number(form.get(`keeper_${sport}`) ?? 0)])) as Record<LeagueSport, number>,
    startingFaab: form.get("startingFaab"), benchSlots: form.get("benchSlots"),
    historical: false, fillWithComputers: form.get("fillWithComputers") === "on",
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
  redirect(`/leagues/${leagueId}?invite=${encodeURIComponent(token)}`);
}

export async function createInviteLinkAction(leagueId: string, _state: { url: string; message: string }, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "invite", 20);
  try {
    const token = await createInvitation(user.id, leagueId, String(form.get("email") ?? ""));
    return { url: new URL(`/join/${encodeURIComponent(token)}`, process.env.AUTH_URL).href, message: "Single-use invitation created." };
  } catch (error) { return { url: "", message: error instanceof Error ? error.message : "Invitation could not be created." }; }
}

export async function renameTeamAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "team-rename", 20);
  await updateTeamName(user.id, leagueId, String(form.get("name") ?? ""));
  await actionNotice("Franchise name updated.");
  revalidatePath(`/leagues/${leagueId}/team`);
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

export async function previewClaimAction(leagueId: string, sport: string, playerId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    const member=await getDatabase().leagueMember.findUniqueOrThrow({where:{leagueId_userId:{leagueId,userId:user.id}},include:{fantasyTeam:true,league:true}});
    if(!member.fantasyTeam) throw new Error("You do not manage a franchise.");
    const selected=await resolveLeagueSport(leagueId,sport);
    if(selected.sport!==sport) throw new Error("Select a participating sport.");
    const player=await getDatabase().player.findFirst({where:{id:playerId,sport:selected.sport,rosterEntries:{none:{leagueId,releasedAt:null}}}});
    if(!player) throw new Error("This player is no longer available.");
    const bid=Number(form.get("bid")??0),funds=await waiverFunds(getDatabase(),leagueId,selected.id,member.fantasyTeam.id);
    if(!Number.isSafeInteger(bid)||bid<0||bid>funds.balance-funds.reserved) throw new Error("Choose an affordable whole-number bid.");
    if(member.league.waiverMethod!=="FAAB"&&bid!==0) throw new Error("Rolling waivers do not accept FAAB bids.");
    (await cookies()).set("pending-acquisition",JSON.stringify({leagueId,sport,playerId,bid,userId:user.id}),{httpOnly:true,sameSite:"strict",secure:process.env.AUTH_URL?.startsWith("https:")??false,path:"/",maxAge:900});
  } catch(error) { return error instanceof Error?error.message:"Unable to prepare claim."; }
  redirect(`/leagues/${leagueId}/team?sport=${encodeURIComponent(sport)}`);
}
export async function cancelAcquisitionAction(leagueId:string,sport:string) {
  await requireSession();(await cookies()).delete("pending-acquisition");
  redirect(`/leagues/${leagueId}/team?sport=${encodeURIComponent(sport)}`);
}

export async function finalClaimAction(leagueId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    await limit(user.id, "waiver-submit", 60);
    await submitWaiver(user.id, { leagueId, sport: String(form.get("sport")), addPlayerId: String(form.get("addPlayerId")), dropPlayerId: String(form.get("dropPlayerId") || "") || null, bid: Number(form.get("bid")) });
    revalidatePath(`/leagues/${leagueId}`, "layout");
  } catch(error) { return error instanceof Error ? error.message : "Claim could not be submitted."; }
  (await cookies()).delete("pending-acquisition");
  redirect(`/leagues/${leagueId}/waivers?sport=${encodeURIComponent(String(form.get("sport")))}`);
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
  const requestedSport = String(form?.get("sport") ?? "") || undefined;
  const league = await getDatabase().league.findUniqueOrThrow({ where: { id: leagueId } });
  if (league.isHistorical && league.competitionType === "HEAD_TO_HEAD") await generateSchedule(user.id, leagueId, 14, requestedSport);
  else {
    const selected = await resolveLeagueSport(leagueId, requestedSport);
    const competition = await getDatabase().sportCompetition.findFirstOrThrow({
      where: { leagueId, sport: selected.sport, leagueSportSeason: { leagueSportId: selected.id, seasonId: selected.seasonId } },
    });
    await provisionCompetitionSchedule(user.id, competition.id);
  }
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
  revalidatePath(`/leagues/${leagueId}/waivers`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function dropPlayerAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "roster-drop", 60);
  await dropPlayer(user.id, leagueId, String(form.get("playerId")), String(form.get("sport") ?? "") || undefined);
  await actionNotice("Player released from your roster.");
  revalidatePath(`/leagues/${leagueId}/waivers`); revalidatePath(`/leagues/${leagueId}/team`);
}

export async function lineupAction(leagueId: string, form: FormData) {
  const { user } = await requireSession();
  await limit(user.id, "lineup", 120);
  const slotIndex = form.get("slotIndex");
  await setLineupSlot(user.id, leagueId, String(form.get("entryId")), String(form.get("slot")),
    String(form.get("sport") ?? "") || undefined, String(form.get("destinationEntryId") ?? "") || null,
    slotIndex == null ? undefined : Number(slotIndex));
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
    name: String(form.get("name") ?? "") || undefined,
    sport: sportValue(form.get("sport")),
    draftSecondsPerPick: Number(form.get("draftSecondsPerPick")), startingFaab: Number(form.get("startingFaab")),
    playoffTeams: Number(form.get("playoffTeams")), playoffPeriods: Number(form.get("playoffPeriods")),
    maxTeams: Number(form.get("maxTeams")), visibility: String(form.get("visibility") ?? "PRIVATE") as "PRIVATE",
    keeperLimit: Number(form.get("keeperLimit") ?? 0), draftRounds: Number(form.get("draftRounds")),
    keeperDeadline: form.get("keeperDeadline") ? new Date(String(form.get("keeperDeadline")) + "Z") : null,
    regularSeasonMatchups: form.get("regularSeasonMatchups") ? Number(form.get("regularSeasonMatchups")) : undefined,
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
  if (await (await import("@/server/gameplay-storage")).hasGameplayTable("TradeProposal")) throw new Error("Use the revisioned multi-asset proposal controls in the trade center. New proposals require identical acceptance and the configured review period.");
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
  const sport = await resolveLeagueSport(leagueId, String(form?.get("sport") ?? "") || undefined);
  const database = getDatabase();
  const league = await database.league.findUniqueOrThrow({ where: { id: leagueId }, select: { isHistorical: true } });
  if (league.isHistorical) {
    await generateNextPlayoffRound(user.id, leagueId, sport.sport);
    revalidatePath(`/leagues/${leagueId}/matchups`);
    return;
  }
  const competition = await database.sportCompetition.findFirstOrThrow({
    where: { leagueId, leagueSportSeason: { leagueSportId: sport.id, seasonId: sport.seasonId } },
  });
  const result = await advanceSportPlayoffs(user.id, competition.id);
  revalidatePath(`/leagues/${leagueId}/matchups`);
  const notices = {
    SCHEDULED: "The next playoff matchups are scheduled.",
    PENDING_REGULAR_RESULTS: "Playoff seeding is waiting for finalized regular-season results.",
    PENDING_PLAYOFF_RESULTS: "The next round is waiting for finalized playoff results.",
    FINALIZED: "Sport placements and championship points are final.",
  };
  await actionNotice(notices[result.status]);
}

export async function provisionFuturePicksAction(leagueId: string, leagueSportId: string) {
  const { user } = await requireSession();
  await limit(user.id, "future-picks", 10);
  const result = await provisionFutureDraftPicks(user.id, leagueId, leagueSportId);
  revalidatePath(`/leagues/${leagueId}/picks`);
  return result.created ? `Granted ${result.created} future picks.` : "All future picks for this sport are already granted.";
}

export async function rookieDraftAction(leagueId: string, leagueSportId: string, _state: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "rookie-draft", 10);
  try {
    await configureRookieDraftPlan(user.id, { leagueId, leagueSportId,
      rounds: Number(form.get("rounds")), reason: String(form.get("reason") ?? ""), scheduledAt: new Date(String(form.get("scheduledAt")) + "Z"), timezone: "UTC", secondsPerPick: Number(form.get("secondsPerPick")), expectedVersion: Number(form.get("version")) || undefined,
    });
    revalidatePath(`/leagues/${leagueId}`, "layout");
    return "Rookie draft scheduled. Preparation opens one hour before the saved UTC start; the worker activates selections at that start.";
  } catch (error) { return error instanceof Error ? error.message : "Unable to start rookie draft."; }
}

export async function correctFuturePickAction(leagueId: string, pickId: string, _state: string, form: FormData) {
  const { user } = await requireSession(); await limit(user.id, "pick-correction", 20);
  try {
    await transferFuturePick(user.id, leagueId, pickId, String(form.get("ownerTeamId")), String(form.get("reason")));
    revalidatePath(`/leagues/${leagueId}`); return "Pick ownership corrected and recorded in the audit history.";
  } catch (error) { return error instanceof Error ? error.message : "Unable to correct pick ownership."; }
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
