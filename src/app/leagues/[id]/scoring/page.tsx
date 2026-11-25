import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { leagueContext } from "@/server/league";
import { statisticDisplayName } from "@/scoring/display-names";

export default async function ScoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const context = await leagueContext(user.id, id); if (!context) notFound();
  const preset = await getDatabase().scoringPreset.findUniqueOrThrow({ where: { id: context.league.presetId }, include: { rules: { orderBy: [{ sport: "asc" }, { applicability: "asc" }, { statKey: "asc" }] } } });
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Scoring settings</p><h1 className="display">{preset.name}</h1><p className="muted">Version {preset.version} · {preset.experimental ? "Experimental" : "Published"}</p></div><section className="panel"><p className="form-notice">V9 is an immutable experimental baseline. V10 is inactive and the 0.5% cross-sport balance target remains unverified.</p><table className="data-table"><thead><tr><th>Sport</th><th>Statistic</th><th>Points</th></tr></thead><tbody>{preset.rules.map((rule) => <tr key={rule.id}><td>{rule.sport}</td><td>{statisticDisplayName(rule.statKey)}</td><td>{rule.coefficient.toFixed(1)}</td></tr>)}</tbody></table></section></LeagueShell>;
}
