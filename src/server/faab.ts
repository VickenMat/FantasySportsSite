import type { FaabAccount, Prisma } from "@/generated/prisma/client";

async function waiverAccountContext(tx: Prisma.TransactionClient, leagueId: string, leagueSportId: string) {
  const league = await tx.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { faabScope: true, universalStartingFaab: true, championshipCycles: { orderBy: { number: "desc" }, take: 1 } },
  });
  const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: leagueSportId, leagueId } });
  const assignment = league.faabScope === "UNIVERSAL" ? await tx.leagueSportSeason.findUnique({ where: { leagueSportId_seasonId: { leagueSportId, seasonId: sport.seasonId } } }) : null;
  const context = league.faabScope === "SPORT"
    ? { leagueSportId, championshipCycleId: null, openingBalance: (await tx.leagueSport.findUniqueOrThrow({ where: { id: leagueSportId } })).startingFaab }
    : { leagueSportId: null, championshipCycleId: assignment?.championshipCycleId ?? league.championshipCycles[0]?.id ?? null, openingBalance: league.universalStartingFaab };
  if (league.faabScope === "UNIVERSAL" && !context.championshipCycleId) throw new Error("Universal FAAB requires an active championship cycle.");
  return { ...context, scope: league.faabScope };
}

export async function waiverFunds(tx: Prisma.TransactionClient, leagueId: string, leagueSportId: string, teamId: string) {
  const context = await waiverAccountContext(tx, leagueId, leagueSportId);
  const account = await tx.faabAccount.findFirst({ where: { leagueId, teamId, scope: context.scope, leagueSportId: context.leagueSportId, championshipCycleId: context.championshipCycleId } });
  return { scope: context.scope, balance: account?.balance ?? context.openingBalance, reserved: account?.reserved ?? 0 };
}

export async function accountForWaiver(tx: Prisma.TransactionClient, leagueId: string, leagueSportId: string, teamId: string): Promise<FaabAccount> {
  const context = await waiverAccountContext(tx, leagueId, leagueSportId);
  const existing = await tx.faabAccount.findFirst({ where: {
    leagueId, teamId, scope: context.scope, leagueSportId: context.leagueSportId, championshipCycleId: context.championshipCycleId,
  } });
  if (existing) return existing;
  const account = await tx.faabAccount.create({ data: {
    leagueId, teamId, ...context, balance: context.openingBalance,
  } });
  await tx.faabLedgerEntry.create({ data: {
    accountId: account.id, type: "OPENING", balanceDelta: account.openingBalance, reservedDelta: 0,
    balanceAfter: account.balance, reservedAfter: 0, reason: `${account.scope} FAAB opening balance.`, idempotencyKey: `faab-opening:${account.id}`,
  } });
  return account;
}

export async function reserveFaab(tx: Prisma.TransactionClient, account: FaabAccount, claimId: string, amount: number) {
  const updated = await tx.faabAccount.updateMany({
    where: { id: account.id, balance: { gte: account.reserved + amount }, reserved: account.reserved },
    data: { reserved: { increment: amount } },
  });
  if (updated.count !== 1) throw new Error("This bid exceeds your unreserved FAAB.");
  await tx.faabLedgerEntry.create({ data: {
    accountId: account.id, claimId, type: "RESERVATION", balanceDelta: 0, reservedDelta: amount,
    balanceAfter: account.balance, reservedAfter: account.reserved + amount, reason: "Sealed waiver bid reservation.",
    idempotencyKey: `faab-reserve:${claimId}`,
  } });
}

export async function releaseFaabReservation(tx: Prisma.TransactionClient, claimId: string, reason: string) {
  const claim = await tx.waiverClaim.findUniqueOrThrow({ where: { id: claimId }, include: { faabAccount: true } });
  const account = claim.faabAccount;
  if (!account || claim.bid === 0) return;
  if (await tx.faabLedgerEntry.findUnique({ where: { idempotencyKey: `faab-release:${claimId}` } })) return;
  const updated = await tx.faabAccount.updateMany({ where: { id: account.id, reserved: { gte: claim.bid } }, data: { reserved: { decrement: claim.bid } } });
  if (updated.count !== 1) throw new Error("The FAAB reservation is inconsistent.");
  await tx.faabLedgerEntry.create({ data: {
    accountId: account.id, claimId, type: "RESERVATION_RELEASE", balanceDelta: 0, reservedDelta: -claim.bid,
    balanceAfter: account.balance, reservedAfter: account.reserved - claim.bid, reason, idempotencyKey: `faab-release:${claimId}`,
  } });
}

export async function settleFaab(tx: Prisma.TransactionClient, claimId: string) {
  const claim = await tx.waiverClaim.findUniqueOrThrow({ where: { id: claimId }, include: { faabAccount: true } });
  const account = claim.faabAccount;
  if (!account) throw new Error("This waiver claim has no FAAB account.");
  if (await tx.faabLedgerEntry.findUnique({ where: { idempotencyKey: `faab-settle:${claimId}` } })) return account;
  const updated = await tx.faabAccount.updateMany({
    where: { id: account.id, balance: { gte: claim.bid }, reserved: { gte: claim.bid } },
    data: { balance: { decrement: claim.bid }, reserved: { decrement: claim.bid } },
  });
  if (updated.count !== 1) throw new Error("The FAAB settlement is inconsistent.");
  const next = { balance: account.balance - claim.bid, reserved: account.reserved - claim.bid };
  await tx.faabLedgerEntry.create({ data: {
    accountId: account.id, claimId, type: "SETTLEMENT", balanceDelta: -claim.bid, reservedDelta: -claim.bid,
    balanceAfter: next.balance, reservedAfter: next.reserved, reason: "Winning waiver claim settled.", idempotencyKey: `faab-settle:${claimId}`,
  } });
  return { ...account, ...next };
}

export async function syncWaiverPriorities(tx: Prisma.TransactionClient, leagueId: string) {
  const [sports, teams] = await Promise.all([
    tx.leagueSport.findMany({ where: { leagueId }, select: { id: true } }),
    tx.fantasyTeam.findMany({ where: { leagueId }, orderBy: [{ draftSlot: "desc" }, { id: "asc" }], select: { id: true } }),
  ]);
  for (const sport of sports) {
    await tx.waiverPriority.updateMany({ where: { leagueSportId: sport.id }, data: { rank: { increment: 10_000 } } });
    for (const [index, team] of teams.entries()) await tx.waiverPriority.upsert({
      where: { leagueSportId_teamId: { leagueSportId: sport.id, teamId: team.id } },
      update: { rank: index + 1 }, create: { leagueId, leagueSportId: sport.id, teamId: team.id, rank: index + 1 },
    });
  }
}

export async function moveWaiverWinnerToBottom(tx: Prisma.TransactionClient, leagueSportId: string, teamId: string) {
  const rows = await tx.waiverPriority.findMany({ where: { leagueSportId }, orderBy: { rank: "asc" } });
  const winner = rows.find((row) => row.teamId === teamId);
  if (!winner || winner.rank === rows.length) return;
  await tx.waiverPriority.update({ where: { id: winner.id }, data: { rank: rows.length + 10_000 } });
  await tx.waiverPriority.updateMany({ where: { leagueSportId, rank: { gt: winner.rank, lte: rows.length } }, data: { rank: { decrement: 1 } } });
  await tx.waiverPriority.update({ where: { id: winner.id }, data: { rank: rows.length } });
}

/** Sport rollover never resets universal funds or another sport's reservations. */
export async function resetSportFaab(tx: Prisma.TransactionClient, leagueId: string, leagueSportId: string, seasonId: string) {
  const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId } });
  if (league.faabScope !== "SPORT") return;
  const sport = await tx.leagueSport.findFirstOrThrow({ where: { id: leagueSportId, leagueId } });
  const rosters = await tx.fantasyRoster.findMany({ where: { leagueSportId } });
  for (const roster of rosters) {
    let account = await accountForWaiver(tx, leagueId, leagueSportId, roster.teamId);
    const key = `faab-reset:${account.id}:${seasonId}`;
    if (await tx.faabLedgerEntry.findUnique({ where: { idempotencyKey: key } })) continue;
    const pending = await tx.waiverClaim.findMany({ where: { faabAccountId: account.id, status: "PENDING" } });
    for (const claim of pending) {
      await releaseFaabReservation(tx, claim.id, "Previous sport-season bid expired at rollover.");
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "CANCELLED", processedAt: new Date() } });
    }
    account = await tx.faabAccount.findUniqueOrThrow({ where: { id: account.id } });
    if (account.reserved !== 0) throw new Error("Cannot reset an inconsistent FAAB reservation balance.");
    await tx.faabAccount.update({ where: { id: account.id }, data: { balance: sport.startingFaab, openingBalance: sport.startingFaab } });
    await tx.faabLedgerEntry.create({ data: { accountId: account.id, type: "RESET", balanceDelta: sport.startingFaab - account.balance,
      reservedDelta: 0, balanceAfter: sport.startingFaab, reservedAfter: 0, idempotencyKey: key,
      reason: `Independent ${sport.sport} FAAB reset for season ${seasonId}.` } });
    await tx.fantasyRoster.update({ where: { id: roster.id }, data: { faabRemaining: sport.startingFaab } });
  }
}
