export function currency(value: number, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000_000) throw new Error("Use an exact nonnegative integer currency amount within the supported range.");
  return value;
}
export function availableCap(account: { baseCap: number; capAdjustment: number; payroll: number; deadCap: number; reserved: number }) {
  const available = account.baseCap + account.capAdjustment - account.payroll - account.deadCap - account.reserved;
  if (!Number.isSafeInteger(available)) throw new Error("Financial arithmetic exceeds exact integer precision.");
  return available;
}
export function releasePenalty(salary: number) { return Math.ceil(currency(salary, 1) / 2); }
export function loweredFloor(previous: number | null, penalty: number) { return previous == null ? currency(penalty, 1) : Math.min(currency(previous, 1), currency(penalty, 1)); }
export function auctionWinner(bids: { teamId: string; maximum: number; tieRank: number }[], minimum: number, mode: "ENGLISH" | "VICKREY") {
  currency(minimum, 1);
  const ranked = [...bids].sort((a, b) => b.maximum - a.maximum || a.tieRank - b.tieRank);
  if (!ranked.length || ranked.some(({ maximum }) => currency(maximum, minimum) < minimum)) throw new Error("Auction needs valid funded bids.");
  if (ranked.length > 1 && ranked[0].maximum === ranked[1].maximum && ranked[0].tieRank === ranked[1].tieRank) throw new Error("An auditable unique tie priority is required.");
  return { teamId: ranked[0].teamId, price: mode === "ENGLISH" ? ranked[0].maximum : Math.max(minimum, Math.min(ranked[0].maximum, ranked[1] ? ranked[1].maximum + 1 : minimum)) };
}
