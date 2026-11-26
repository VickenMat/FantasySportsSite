import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { availableCap, auctionWinner, currency } from "@/finance/rules";
import { accountForAcquisition, bookFinance, clearPlayerDeadCap, financePolicy, selfReacquisitionCredit } from "./finance";
import { currentCompliance } from "./rosters";
import { firstOpenSlot } from "@/rosters/compliance";
import { fitsSlot } from "@/simulation/config";
import { recordCompetitionDraw, rankH2HStandings, summarizeH2H } from "./competition";
import { scoreCapturedStarters } from "./competition-scoring";
import { getEligiblePositions } from "./positions";
import { hasGameplayTable } from "./gameplay-storage";
import { runBackgroundJob } from "./background-jobs";
import { automaticCandidate } from "./draft";
import { ensureRelativeMatchupSchedule } from "./matchups";
import { captureDraftSelection } from "./draft-recaps";

type Tx = Prisma.TransactionClient;
async function managedTeam(tx: Tx, userId: string, leagueId: string) {
  return tx.fantasyTeam.findFirstOrThrow({ where: { leagueId, managerId: userId } });
}
async function priorityForAuction(tx: Tx, leagueId: string, leagueSportId: string, scopeId: string, at: Date) {
  const teams = await tx.fantasyTeam.findMany({ where: { leagueId }, orderBy: { id: "asc" } });
  const draw = await recordCompetitionDraw(tx, leagueId, "AUCTION_PRIORITY", scopeId, teams.map(({ id }) => id));
  const random = new Map(draw.map(({ teamId, drawRank }) => [teamId, drawRank]));
  const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: leagueSportId }, include: { league: true } });
  const competition = await tx.sportCompetition.findFirst({ where: { leagueSportSeason: { leagueSportId, seasonId: sport.seasonId } } });
  if (!competition) return draw.map(({ teamId }) => teamId);
  if (sport.league.competitionType === "CUMULATIVE") {
    const totals = await scoreCapturedStarters(tx, [competition.id], at);
    if (!totals.some(({ scoredStarters }) => scoredStarters > 0)) return draw.map(({ teamId }) => teamId);
    const points = new Map<string, bigint>();
    for (const row of totals) points.set(row.teamId, (points.get(row.teamId) ?? 0n) + row.pointsFor);
    return teams.map(({ id }) => id).sort((a, b) => (points.get(a) ?? 0n) === (points.get(b) ?? 0n) ? random.get(a)! - random.get(b)! : (points.get(a) ?? 0n) < (points.get(b) ?? 0n) ? -1 : 1);
  }
  const games = await tx.matchup.findMany({ where: { leagueId, status: "FINAL", period: { competitionId: competition.id, periodType: "REGULAR" } } });
  return games.length ? rankH2HStandings(summarizeH2H(teams.map(({ id }) => id), games), games, random).reverse().map(({ teamId }) => teamId) : draw.map(({ teamId }) => teamId);
}
export async function nominateAuction(userId: string | undefined, input: { leagueId: string; leagueSportId: string; playerId: string; draftId?: string; systemTeamId?: string; expectedPick?: number }, now = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const team = input.systemTeamId && userId === undefined ? await tx.fantasyTeam.findFirstOrThrow({ where: { id: input.systemTeamId, leagueId: input.leagueId } }) : await managedTeam(tx, userId!, input.leagueId);
    const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: input.leagueSportId, leagueId: input.leagueId } });
    const player = await tx.player.findUniqueOrThrow({ where: { id: input.playerId } });
    if (player.sport !== sport.sport) throw new Error("Choose a player from the nominated sport.");
    const policy = await financePolicy(tx, input.leagueId);
    if (!policy) throw new Error("Configure auction finances before nominating.");
    const compliance = await currentCompliance(tx, team.id, now);
    if (compliance.state !== "COMPLIANT") throw new Error(compliance.reasons.join(" "));
    if (await tx.rosterEntry.findFirst({ where: { leagueId: input.leagueId, playerId: player.id, releasedAt: null } })) throw new Error("Rostered players cannot be nominated.");
    const draft = input.draftId ? await tx.draft.findFirstOrThrow({ where: { id: input.draftId, leagueId: input.leagueId }, include: { plan: true } }) : null;
    if (input.systemTeamId && (!draft || !draft.pickDeadlineAt || draft.pickDeadlineAt > now || draft.currentPick !== input.expectedPick)) throw new Error("Automatic nomination requires the unchanged expired draft clock.");
    if (draft && (draft.status !== "ACTIVE" || draft.plan?.method !== "AUCTION" || draft.pickOrder[draft.currentPick - 1] !== team.id)) throw new Error("Nominations open only on your active auction nomination turn.");
    if (draft && draft.leagueSportId !== sport.id && draft.plan?.scope !== "UNIVERSAL") throw new Error("This draft only covers its selected sport.");
    if (!draft && !policy.salaryMode) throw new Error("Traditional auctions require an active auction draft.");
    if (!draft && !await tx.rookieEligibilityEvidence.findFirst({ where: { playerId: player.id, seasonId: sport.seasonId, knownAt: { lte: now }, effectiveAt: { lte: now } } })) throw new Error("PENDING_DATA: official season-specific rookie status is required for salary free-agent acquisition.");
    const id = randomUUID();
    const floor = policy.salaryMode ? await tx.releasedPlayerFloor.findUnique({ where: { leagueId_playerId: { leagueId: input.leagueId, playerId: player.id } } }) : null;
    const minimum = floor?.amount ?? 1;
    const priority = await priorityForAuction(tx, input.leagueId, sport.id, id, now);
    const auction = await tx.acquisitionAuction.create({ data: { id, leagueId: input.leagueId, leagueSportId: sport.id, playerId: player.id, nominatorTeamId: team.id,
      draftId: draft?.id, mode: draft ? "ENGLISH" : "VICKREY", priority, minimum, opensAt: now, closesAt: new Date(+now + (draft ? draft.secondsPerPick * 1000 : 86400000)) } });
    await placeAuctionBidTx(tx, userId ?? "", auction.id, minimum, now, team.id);
    if (draft) await tx.draft.update({ where: { id: draft.id }, data: { pickDeadlineAt: auction.closesAt } });
    return auction;
  }, { isolationLevel: "Serializable" });
}
async function placeAuctionBidTx(tx: Tx, userId: string, auctionId: string, maximum: number, now: Date, authorizedTeamId?: string) {
  currency(maximum, 1);
  const auction = await tx.acquisitionAuction.findUniqueOrThrow({ where: { id: auctionId }, include: { draft: true, bids: true } });
  if (auction.status !== "OPEN" || auction.opensAt > now || auction.closesAt <= now || (auction.draft && auction.draft.status !== "ACTIVE")) throw new Error("This auction is not accepting bids.");
  const team = authorizedTeamId ? await tx.fantasyTeam.findFirstOrThrow({ where: { id: authorizedTeamId, leagueId: auction.leagueId } }) : await managedTeam(tx, userId, auction.leagueId);
  const compliance = await currentCompliance(tx, team.id, now);
  if (compliance.state !== "COMPLIANT") throw new Error(compliance.reasons.join(" "));
  const old = auction.bids.find(({ teamId }) => teamId === team.id);
  if (maximum < auction.minimum || (old && maximum <= old.maximum)) throw new Error("Bids must meet the floor and increase your prior maximum.");
  if (auction.mode === "ENGLISH" && auction.bids.some((bid) => bid.maximum >= maximum)) throw new Error("A draft auction bid must exceed the current public price.");
  const account = await accountForAcquisition(tx, auction.leagueSportId, team.id, auction.draftId);
  const credit = account.kind === "SALARY" ? await selfReacquisitionCredit(tx, account.id, auction.playerId, now) : 0;
  const reservation = Math.max(0, maximum - credit);
  if (auction.draft) {
    const won = await tx.draftPick.count({ where: { draftId: auction.draft.id, teamId: team.id } });
    if (won >= auction.draft.rounds) throw new Error("This franchise has filled its configured auction draft roster.");
    const plan = await tx.draftPlan.findUnique({ where: { draftId: auction.draft.id } });
    const keep = plan?.scope === "UNIVERSAL" && account.leagueSportId ? 0 : auction.draft.rounds - won - 1;
    if (availableCap(account) + (old?.reservation ?? 0) - reservation < keep) throw new Error("Reserve at least one currency unit for each remaining draft roster place.");
  }
  const version = (old?.version ?? 0) + 1;
  await bookFinance(tx, account.id, `auction-bid:${auction.id}:${team.id}:${version}`, "BID_RESERVATION", { reserved: reservation - (old?.reservation ?? 0) }, { auctionId, maximum, version, credit });
  if (auction.mode === "ENGLISH") for (const losing of auction.bids.filter((bid) => bid.teamId !== team.id && bid.reservation > 0)) {
    await bookFinance(tx, losing.accountId, `auction-outbid:${auction.id}:${losing.id}:${version}:${team.id}`, "BID_RELEASE", { reserved: -losing.reservation }, { auctionId }, false);
    await tx.acquisitionBid.update({ where: { id: losing.id }, data: { reservation: 0 } });
  }
  const rank = auction.priority.indexOf(team.id) + 1;
  if (!rank) throw new Error("Auction priority snapshot does not include this franchise.");
  const bid = await tx.acquisitionBid.upsert({ where: { auctionId_teamId: { auctionId, teamId: team.id } }, create: { auctionId, teamId: team.id, accountId: account.id, maximum, reservation, tieRank: rank, version }, update: { maximum, reservation, version } });
  if (auction.mode === "ENGLISH") {
    const closesAt = new Date(+now + auction.draft!.secondsPerPick * 1000);
    await tx.acquisitionAuction.update({ where: { id: auctionId }, data: { closesAt } });
    await tx.draft.update({ where: { id: auction.draft!.id }, data: { pickDeadlineAt: closesAt } });
  }
  return bid;
}
export function placeAuctionBid(userId: string, auctionId: string, maximum: number, now = new Date()) {
  return getDatabase().$transaction((tx) => placeAuctionBidTx(tx, userId, auctionId, maximum, now), { isolationLevel: "Serializable" });
}
export async function settleAuction(auctionId: string, now = new Date()) {
  return getDatabase().$transaction(async (tx) => {
    const auction = await tx.acquisitionAuction.findUniqueOrThrow({ where: { id: auctionId }, include: { bids: true, draft: { include: { plan: true } } } });
    if (auction.status === "SETTLED") return auction;
    if (auction.status !== "OPEN" || auction.closesAt > now || (auction.draft && auction.draft.status !== "ACTIVE")) throw new Error("Auction settlement is not due.");
    const winner = auctionWinner(auction.bids, auction.minimum, auction.mode as "ENGLISH" | "VICKREY");
    const bid = auction.bids.find(({ teamId }) => teamId === winner.teamId)!;
    const compliance = await currentCompliance(tx, winner.teamId, now);
    if (compliance.state !== "COMPLIANT") throw new Error("Winning franchise must restore roster and salary compliance before settlement.");
    if (await tx.rosterEntry.findFirst({ where: { leagueId: auction.leagueId, playerId: auction.playerId, releasedAt: null } })) throw new Error("The nominated player's ownership changed.");
    const account = await tx.financeAccount.findUniqueOrThrow({ where: { id: bid.accountId } });
    if (account.kind === "SALARY") await selfReacquisitionCredit(tx, account.id, auction.playerId, now);
    for (const row of auction.bids) {
      await bookFinance(tx, row.accountId, `auction-release:${auction.id}:${row.id}`, "BID_RELEASE", { reserved: -row.reservation }, { auctionId: auction.id }, false);
      await tx.acquisitionBid.update({ where: { id: row.id }, data: { reservation: 0 } });
    }
    if (account.kind === "SALARY") await clearPlayerDeadCap(tx, auction.leagueId, auction.playerId, `auction:${auction.id}`, now);
    await bookFinance(tx, account.id, `auction-pay:${auction.id}`, "AUCTION_SETTLEMENT", { payroll: winner.price }, { auctionId: auction.id, playerId: auction.playerId, price: winner.price, teamId: winner.teamId });
    const sport = await tx.leagueSport.findUniqueOrThrow({ where: { id: auction.leagueSportId }, include: { season: true, league: true } });
    const roster = await tx.fantasyRoster.findUniqueOrThrow({ where: { teamId_leagueSportId: { teamId: winner.teamId, leagueSportId: sport.id } } });
    const entries = await tx.rosterEntry.findMany({ where: { teamId: winner.teamId, releasedAt: null } });
    const eligibility = await getEligiblePositions({ playerId: auction.playerId, sport: sport.sport, seasonYear: sport.season.startYear, asOf: now }, tx);
    let slot = sport.rosterSlots.find((slot) => fitsSlot(sport.sport, slot, new Set(eligibility.positions)) && entries.filter((entry) => entry.rosterId === roster.id && entry.slot === slot).length < sport.rosterSlots.filter((value) => value === slot).length) ?? "BENCH";
    let used = entries.filter((entry) => entry.rosterId === roster.id && entry.slot === slot);
    let capacity = slot === "BENCH" ? sport.benchSlots : sport.rosterSlots.filter((value) => value === slot).length;
    if (!firstOpenSlot(new Set(used.map(({ slotIndex }) => slotIndex)), capacity)) { slot = "UNIVERSAL_BENCH"; capacity = sport.league.universalBenchSlots; used = entries.filter((entry) => entry.slot === slot); }
    const slotIndex = firstOpenSlot(new Set(used.map(({ slotIndex }) => slotIndex)), capacity);
    if (!slotIndex) throw new Error("Winning franchise has no legal open roster position. Authorize a release before settlement.");
    const entry = await tx.rosterEntry.create({ data: { leagueId: auction.leagueId, teamId: winner.teamId, rosterId: roster.id, playerId: auction.playerId, sport: sport.sport, seasonId: sport.seasonId, slot, slotIndex, acquiredAt: now } });
    await tx.rosterAssignmentEvent.create({ data: { leagueId: auction.leagueId, teamId: winner.teamId, rosterEntryId: entry.id, toSlot: slot, toSlotIndex: slotIndex, effectiveAt: now, reason: "Atomic auction settlement", idempotencyKey: `auction-roster:${auction.id}` } });
    if (account.kind === "SALARY") await tx.playerSalary.upsert({ where: { leagueId_playerId: { leagueId: auction.leagueId, playerId: auction.playerId } }, create: { leagueId: auction.leagueId, playerId: auction.playerId, teamId: winner.teamId, accountId: account.id, amount: winner.price }, update: { teamId: winner.teamId, accountId: account.id, amount: winner.price, active: true, version: { increment: 1 } } });
    await tx.fantasyTransaction.create({ data: { leagueId: auction.leagueId, leagueSportId: sport.id, rosterId: roster.id, sport: sport.sport, teamId: winner.teamId, playerId: auction.playerId, type: auction.draftId ? "DRAFT" : "ADD", amount: winner.price, note: `${auction.mode} auction ${auction.id}` } });
    if (auction.draft) {
      const draft = auction.draft;
      const pick = await tx.draftPick.create({ data: { draftId: draft.id, teamId: winner.teamId, playerId: auction.playerId, overall: draft.currentPick, round: Math.floor((draft.currentPick - 1) / draft.order.length) + 1, roundPick: (draft.currentPick - 1) % draft.order.length + 1 } });
      await captureDraftSelection(tx, pick.id, winner.teamId, "AUCTION", winner.price);
      const complete = draft.currentPick >= draft.pickOrder.length;
      const pickOrder = [...draft.pickOrder];
      if (!complete) {
        const counts = await tx.draftPick.groupBy({ by: ["teamId"], where: { draftId: draft.id }, _count: true });
        const count = new Map(counts.map((row) => [row.teamId, row._count]));
        const start = draft.order.indexOf(auction.nominatorTeamId);
        pickOrder[draft.currentPick] = Array.from({ length: draft.order.length }, (_, index) => draft.order[(start + index + 1) % draft.order.length]).find((id) => (count.get(id) ?? 0) < draft.rounds)!;
      }
      await tx.draft.update({ where: { id: draft.id }, data: complete ? { status: "COMPLETE", completedAt: now, pickDeadlineAt: null, version: { increment: 1 } } : { currentPick: { increment: 1 }, pickOrder, pickStartedAt: now, pickDeadlineAt: new Date(+now + draft.secondsPerPick * 1000), version: { increment: 1 } } });
      await tx.draftPlan.updateMany({ where: { draftId: draft.id }, data: { status: complete ? "COMPLETED" : "IN_PROGRESS" } });
      const covered = draft.plan?.scope === "UNIVERSAL" ? await tx.leagueSport.findMany({ where: { leagueId: draft.leagueId } }) : [sport];
      if (complete && draft.kind === "INITIAL") for (const row of covered) await ensureRelativeMatchupSchedule(tx, { leagueId: draft.leagueId, leagueSportId: row.id, sport: row.sport, periods: row.regularSeasonMatchups });
      if (complete) {
        const priority = await recordCompetitionDraw(tx, draft.leagueId, "AUCTION_WAIVER_PRIORITY", draft.id, draft.order);
        for (const coveredSport of covered) {
          await tx.waiverPriority.updateMany({ where: { leagueSportId: coveredSport.id }, data: { rank: { increment: 10000 } } });
          for (const row of priority) await tx.waiverPriority.update({ where: { leagueSportId_teamId: { leagueSportId: coveredSport.id, teamId: row.teamId } }, data: { rank: row.drawRank } });
        }
      }
      if (complete && !await tx.draft.count({ where: { leagueId: auction.leagueId, id: { not: draft.id }, status: { in: ["ACTIVE", "PAUSED"] } } })) await tx.league.update({ where: { id: auction.leagueId }, data: { status: "ACTIVE" } });
    }
    return tx.acquisitionAuction.update({ where: { id: auction.id }, data: { status: "SETTLED", winnerTeamId: winner.teamId, price: winner.price, settledAt: now } });
  }, { isolationLevel: "Serializable" });
}
export async function processDueAuctions(now = new Date()) {
  if (!await hasGameplayTable("LeagueFinancePolicy")) return [];
  const auctions = await getDatabase().acquisitionAuction.findMany({ where: { status: "OPEN", closesAt: { lte: now }, OR: [{ draftId: null }, { draft: { status: "ACTIVE" } }] } });
  return Promise.all(auctions.map((auction) => runBackgroundJob(`auction:${auction.id}`, "auction-settlement", () => settleAuction(auction.id, now), now)));
}

export async function processAuctionDraftClocks(now = new Date()) {
  if (!await hasGameplayTable("LeagueFinancePolicy")) return [];
  const db = getDatabase();
  const drafts = await db.draft.findMany({ where: { status: "ACTIVE", pickDeadlineAt: { lte: now }, plan: { method: "AUCTION" }, auctions: { none: { status: "OPEN" } } } });
  return Promise.all(drafts.map((draft) => runBackgroundJob(`auction-nomination:${draft.id}:${draft.currentPick}:${draft.version}`, "auction-nomination", async () => {
    const teamId = draft.pickOrder[draft.currentPick - 1]; const player = await automaticCandidate(draft.id, teamId);
    if (!player) throw new Error("No eligible player or roster capacity is available for automatic nomination.");
    const sport = await db.leagueSport.findUniqueOrThrow({ where: { leagueId_sport: { leagueId: draft.leagueId, sport: player.sport } } });
    return nominateAuction(undefined, { leagueId: draft.leagueId, leagueSportId: sport.id, playerId: player.id, draftId: draft.id, systemTeamId: teamId, expectedPick: draft.currentPick }, now);
  }, now)));
}

export async function cancelAuction(userId: string, auctionId: string, reason: string, now = new Date()) {
  if (reason.trim().length < 10) throw new Error("An explicit administrative cancellation reason is required.");
  return getDatabase().$transaction(async (tx) => {
    const auction = await tx.acquisitionAuction.findUniqueOrThrow({ where: { id: auctionId }, include: { bids: true, draft: true } });
    const member = await tx.leagueMember.findUnique({ where: { leagueId_userId: { leagueId: auction.leagueId, userId } } });
    if (member?.role !== "COMMISSIONER") throw new Error("Only the commissioner can administratively cancel an auction.");
    if (auction.status === "CANCELLED") return auction;
    if (auction.status !== "OPEN") throw new Error("Settled or expired auctions cannot be cancelled.");
    for (const bid of auction.bids) {
      await bookFinance(tx, bid.accountId, `auction-cancel:${auction.id}:${bid.id}`, "BID_RELEASE", { reserved: -bid.reservation }, { auctionId: auction.id, reason }, false);
      await tx.acquisitionBid.update({ where: { id: bid.id }, data: { reservation: 0 } });
    }
    if (auction.draft) await tx.draft.update({ where: { id: auction.draft.id }, data: { pickStartedAt: now, pickDeadlineAt: new Date(+now + auction.draft.secondsPerPick * 1000), version: { increment: 1 } } });
    await tx.commissionerAuditEvent.create({ data: { leagueId: auction.leagueId, actorUserId: userId, action: "CANCEL_AUCTION", targetType: "AcquisitionAuction", targetId: auction.id, before: { status: auction.status }, after: { status: "CANCELLED" }, reason } });
    return tx.acquisitionAuction.update({ where: { id: auctionId }, data: { status: "CANCELLED" } });
  }, { isolationLevel: "Serializable" });
}
