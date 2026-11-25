import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { CommissionerReleaseForm } from "@/components/commissioner-release-form";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";

export default async function RostersPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params;
  const context = await leagueContext(user.id, id);
  if (!context) notFound();
  const teams = await getDatabase().fantasyTeam.findMany({ where: { leagueId: id }, orderBy: { draftSlot: "asc" }, include: {
    sportRosters: { include: { leagueSport: true, entries: { where: { releasedAt: null }, include: { player: true }, orderBy: [{ slot: "asc" }, { slotIndex: "asc" }] } } },
  } });
  return <LeagueShell leagueId={id}><h1 className="display">League rosters and compliance</h1><p>Every active player is listed, including occupants beyond configured capacity. Managers correct their own roster through My Team. Commissioner releases require an explicit reason; locked players remain protected.</p>
    {teams.map((team) => <section className="panel" key={team.id}><h2 className="display">{team.name}</h2>{team.sportRosters.map((roster) => <div key={roster.id}><h3>{roster.sport}: {roster.entries.filter(({ slot }) => slot === "BENCH").length}/{roster.leagueSport.benchSlots} sport bench</h3><table className="data-table"><thead><tr><th>Player</th><th>Slot</th><th>Index</th><th>Correction</th></tr></thead><tbody>{roster.entries.map((entry) => <tr key={entry.id}><td>{entry.player.displayName}</td><td>{entry.slot}</td><td>{entry.slotIndex}</td><td>{entry.lockedAt ? "Locked" : context.role === "COMMISSIONER" ? <CommissionerReleaseForm leagueId={id} entryId={entry.id} name={entry.player.displayName} /> : "Manager or commissioner action required"}</td></tr>)}</tbody></table></div>)}</section>)}
  </LeagueShell>;
}
