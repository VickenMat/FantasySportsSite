import { readFile } from "node:fs/promises";
import path from "node:path";
import { DashboardHeader } from "@/components/dashboard-header";
import { requireSession } from "@/lib/auth";

type Report = { sport: string; totals: { rows: number; acceptedRows: number; quarantinedRows: number }; seasons: { season: number; coverage: string; games: number; evidence: { lineup: Record<string, { percent: number }> } }[] };
type Analysis = { reports: Report[]; balanceAssessment: { targetPercent: number; spreadPercent: number | null; status: string; reason: string }; v10: { status: string; reason: string } };

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ sport?: string; season?: string }> }) {
  await requireSession(); const query = await searchParams;
  const analysis = JSON.parse(await readFile(path.join(process.cwd(), "reports/m2-5-analysis.json"), "utf8")) as Analysis;
  const report = analysis.reports.find(({ sport }) => sport === (query.sport ?? "NFL")) ?? analysis.reports[0];
  const season = report.seasons.find((item) => item.season === Number(query.season)) ?? report.seasons.at(-1)!;
  return <><DashboardHeader /><main id="main" className="shell workspace"><div className="workspace-intro"><p className="eyebrow">Historical UBP analysis</p><h1 className="display">Evidence before conclusions</h1><p className="muted">Final box scores are immutable inputs. Diagnostic reconstruction is never labeled verified.</p></div>
    <form className="filter-bar"><select name="sport" defaultValue={report.sport}>{analysis.reports.map(({ sport }) => <option key={sport}>{sport}</option>)}</select><select name="season" defaultValue={season.season}>{report.seasons.map(({ season }) => <option key={season}>{season}</option>)}</select><button className="button secondary">View</button></form>
    <div className="metric-grid"><article className="metric"><span>Source rows</span><strong>{report.totals.rows.toLocaleString()}</strong></article><article className="metric"><span>Accepted</span><strong>{report.totals.acceptedRows.toLocaleString()}</strong></article><article className="metric"><span>Quarantined</span><strong>{report.totals.quarantinedRows.toLocaleString()}</strong></article><article className="metric"><span>Fixtures</span><strong>{season.games.toLocaleString()}</strong></article></div>
    <div className="league-details"><section className="panel"><h2 className="display">{report.sport} {season.season}</h2><p><span className="tag">{season.coverage}</span></p><h3>Lineup evidence</h3>{Object.entries(season.evidence.lineup).map(([kind, value]) => <div className="coverage-row" key={kind}><span>{kind}</span><progress max="100" value={value.percent} /><strong>{value.percent}%</strong></div>)}</section>
    <section className="panel"><h2 className="display">Cross-sport balance</h2><p className="balance-status">{analysis.balanceAssessment.status}</p><p>{analysis.balanceAssessment.spreadPercent == null ? "No defensible spread is available." : `${analysis.balanceAssessment.spreadPercent.toFixed(3)}% spread`}</p><p className="muted">Target {analysis.balanceAssessment.targetPercent}% or less. {analysis.balanceAssessment.reason}</p><h3>Experimental V10</h3><p>{analysis.v10.status}</p><p className="muted">{analysis.v10.reason}</p></section></div>
  </main></>;
}
