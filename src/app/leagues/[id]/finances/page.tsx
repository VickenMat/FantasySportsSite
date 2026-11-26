import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { FinancePolicyForm } from "@/components/auction-actions";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";
import { financePolicy } from "@/server/finance";
import { hasGameplayTable } from "@/server/gameplay-storage";
import { availableCap } from "@/finance/rules";

export default async function FinancesPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const db = getDatabase(); const enabled = await hasGameplayTable("LeagueFinancePolicy"); const policy = await financePolicy(db, id);
  const accounts = enabled && context.fantasyTeam ? await db.financeAccount.findMany({ where: { leagueId: id, teamId: context.fantasyTeam.id }, include: { ledger: { orderBy: { createdAt: "desc" }, take: 100 }, obligations: { where: { clearedAt: null }, include: { player: true } } } }) : [];
  const salaries = policy?.salaryMode ? await db.playerSalary.findMany({ where: { leagueId: id, active: true }, include: { player: true, team: true }, orderBy: [{ teamId: "asc" }, { amount: "desc" }] }) : [];
  return <LeagueShell leagueId={id}><h1 className="display">Auction budgets and salary caps</h1>
    {!enabled && <p role="status">Financial features require approval and deployment of the prepared additive migration. No development records have been converted.</p>}
    {!policy && context.role === "COMMISSIONER" && context.league.status === "SETUP" && <FinancePolicyForm leagueId={id} enabled={enabled} />}
    {policy && <p>{policy.salaryMode ? "Salary dynasty" : "Traditional auction"} · {policy.scope} · base {policy.amount}. Full salary follows the player, including injured players. FAAB is separate; contracts remain inactive.</p>}
    {accounts.map((account) => <section className="panel" key={account.id}><h2>{account.scopeKey}</h2><p>Base {account.baseCap} · net transfers {account.capAdjustment} · payroll {account.payroll} · dead cap {account.deadCap} · reserved {account.reserved} · available {availableCap(account)}</p>{availableCap(account) < 0 && <p role="alert">Cut players to restore compliance. Ordinary acquisitions, outgoing proposals and lineup changes are blocked.</p>}
      <ul>{account.obligations.map((row) => <li key={row.id}>{row.player.displayName}: {row.amount} dead cap · released {row.releasedAt.toISOString()} UTC</li>)}</ul>
      <details><summary>My immutable financial ledger</summary><ul>{account.ledger.map((entry) => <li key={entry.id}>{entry.createdAt.toISOString()} · {entry.type} · available after {entry.availableAfter}<pre>{JSON.stringify(entry.metadata)}</pre></li>)}</ul></details>
    </section>)}
    {salaries.length > 0 && <section className="panel"><h2>Player salaries</h2><table className="data-table"><thead><tr><th>Player</th><th>Sport</th><th>Franchise</th><th>Full salary</th></tr></thead><tbody>{salaries.map((salary) => <tr key={salary.id}><td>{salary.player.displayName}</td><td>{salary.player.sport}</td><td>{salary.team.name}</td><td>{salary.amount}</td></tr>)}</tbody></table></section>}
  </LeagueShell>;
}
