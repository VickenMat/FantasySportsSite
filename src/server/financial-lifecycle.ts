import type { Prisma, Sport } from "@/generated/prisma/client";
import { accountForAcquisition, bookFinance, financePolicy } from "./finance";

/** Called inside the sport rollover transaction after its current-season pointer advances. */
export async function rolloverSportFinances(tx: Prisma.TransactionClient, leagueId: string, leagueSportId: string, sport: Sport, oldSeasonId: string, nextSeasonId: string, at: Date, actorUserId: string) {
  const policy = await financePolicy(tx, leagueId);
  if (!policy?.salaryMode) return;
  const auctions = await tx.acquisitionAuction.findMany({ where: { leagueId, leagueSportId, status: "OPEN" }, include: { bids: true } });
  for (const auction of auctions) {
    for (const bid of auction.bids) {
      await bookFinance(tx, bid.accountId, `rollover-auction:${nextSeasonId}:${bid.id}`, "BID_RELEASE", { reserved: -bid.reservation }, { auctionId: auction.id, nextSeasonId }, false);
      await tx.acquisitionBid.update({ where: { id: bid.id }, data: { reservation: 0 } });
    }
    await tx.acquisitionAuction.update({ where: { id: auction.id }, data: { status: "EXPIRED", settledAt: at } });
  }
  const obligations = await tx.deadCapObligation.findMany({ where: { clearedAt: null, account: { leagueId }, player: { sport } } });
  for (const obligation of obligations) {
    await bookFinance(tx, obligation.accountId, `rollover-dead:${nextSeasonId}:${obligation.id}`, "DEAD_CAP_EXPIRY", { dead: -obligation.amount }, { obligationId: obligation.id, nextSeasonId }, false);
    await tx.deadCapObligation.update({ where: { id: obligation.id }, data: { clearedAt: at } });
  }
  const retained = await tx.playerSalary.findMany({ where: { leagueId, active: true, player: { sport } }, orderBy: { id: "asc" } });
  for (const salary of retained) {
    const account = await accountForAcquisition(tx, leagueSportId, salary.teamId);
    const key = `annual-salary:${nextSeasonId}:${salary.id}`;
    if (await tx.financeLedgerEntry.findUnique({ where: { idempotencyKey: key } })) continue;
    if (salary.accountId === account.id) await bookFinance(tx, account.id, key, "ANNUAL_SALARY", { payroll: 2 }, { playerId: salary.playerId, previousSalary: salary.amount, salary: salary.amount + 2, nextSeasonId }, false);
    else {
      await bookFinance(tx, salary.accountId, `${key}:old`, "SALARY_ROLLOVER", { payroll: -salary.amount }, { playerId: salary.playerId, nextSeasonId }, false);
      await bookFinance(tx, account.id, key, "ANNUAL_SALARY", { payroll: salary.amount + 2 }, { playerId: salary.playerId, previousSalary: salary.amount, salary: salary.amount + 2, nextSeasonId }, false);
    }
    await tx.playerSalary.update({ where: { id: salary.id }, data: { amount: { increment: 2 }, accountId: account.id, version: { increment: 1 } } });
  }
  const oldAccounts = await tx.financeAccount.findMany({ where: { leagueId, leagueSportId, seasonId: oldSeasonId, status: "ACTIVE", kind: "SALARY" } });
  for (const account of oldAccounts) {
    if (account.reserved !== 0 || account.payroll !== 0 || account.deadCap !== 0) throw new Error("Old sport financial obligations must settle before the account can expire.");
    await bookFinance(tx, account.id, `cap-expiry:${nextSeasonId}:${account.id}`, "CAP_TRANSFER_EXPIRY", { cap: -account.capAdjustment }, { oldSeasonId, nextSeasonId }, false);
    await tx.financeAccount.update({ where: { id: account.id }, data: { status: "EXPIRED" } });
  }
  const floors = await tx.releasedPlayerFloor.findMany({ where: { leagueId, player: { sport, rosterEntries: { none: { leagueId, releasedAt: null } } } } });
  if (floors.length) {
    await tx.commissionerAuditEvent.create({ data: { leagueId, actorUserId, action: "OFFSEASON_PLAYER_FLOOR_EXPIRY", targetType: "LeagueSport", targetId: leagueSportId, sport,
      before: { floors: floors.map(({ playerId, amount }) => ({ playerId, amount })) }, after: { removed: floors.length, nextSeasonId }, reason: "Unrostered players entered their sport offseason; franchise dead-cap obligations are tracked independently." } });
    await tx.releasedPlayerFloor.deleteMany({ where: { id: { in: floors.map(({ id }) => id) } } });
  }
}

export async function expireCompletedCycleFinance(tx: Prisma.TransactionClient, cycleId: string) {
  const cycle = await tx.championshipCycle.findUniqueOrThrow({ where: { id: cycleId } });
  if (cycle.status !== "COMPLETE") throw new Error("Universal cap transfers expire only after the applicable championship cycle completes.");
  const accounts = await tx.financeAccount.findMany({ where: { cycleId, leagueSportId: null, kind: "SALARY", status: "ACTIVE" } });
  for (const account of accounts) {
    const key = `universal-cap-expiry:${account.id}`;
    if (!await tx.financeLedgerEntry.findUnique({ where: { idempotencyKey: key } })) await bookFinance(tx, account.id, key, "CAP_TRANSFER_EXPIRY", { cap: -account.capAdjustment }, { cycleId }, false);
    // Overlapping sport obligations remain on their original accounts until their independent rollover.
    if (account.payroll === 0 && account.deadCap === 0 && account.reserved === 0) await tx.financeAccount.update({ where: { id: account.id }, data: { status: "EXPIRED" } });
  }
}
