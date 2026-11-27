"""Strict versus reconstructed gate counts, with evidence definitions explicit.
The constructed pool's G08 is conservative applicable-position presence; the
strict report's G08 remains source-row position presence. Never conflate them.
"""
import hashlib,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
old=json.loads((R/'reports/m6-simulation-gate-audit.json').read_text());compiled=json.loads((R/'reports/m61-approved-model-gates.json').read_text());cohorts=[]
for c in old['cohorts']:
 model=next(x for x in compiled['cohorts'] if x['sport']==c['sport'] and x['year']==c['seasonStartYear']);candidate=model['candidateModelWaterfall'];primary=model['approvedPrimaryWaterfall'];rows=[]
 for i,g in enumerate(old['gates']):
  strict_pass=c['physicalRows']-c['independentFailCounts'].get(g['id'],0)
  primary_independent=0 if i>=8 else c['physicalRows']-model['candidateIndependentFailures'].get(g['id'],0)
  rows.append({'gate':g['id'],'strictIndependentPassing':strict_pass,'strictWaterfall':c['waterfall'][i]['remainingRows'],'approvedPrimaryIndependentPassing':primary_independent,'approvedPrimaryIndependentFailures':c['physicalRows']-primary_independent,'approvedPrimaryWaterfall':primary[i],'approvedPrimaryNewExclusions':(c['physicalRows'] if i==0 else primary[i-1])-primary[i],'calendarDiagnosticWaterfall':candidate[i],'calendarDiagnosticNewExclusions':(c['physicalRows'] if i==0 else candidate[i-1])-candidate[i],'calendarIndependentFailures':model['candidateIndependentFailures'].get(g['id'],0)})
 assert all(row['approvedPrimaryNewExclusions']>=0 and row['calendarDiagnosticNewExclusions']>=0 for row in rows)
 cohorts.append({'sport':c['sport'],'year':c['seasonStartYear'],'physicalRows':c['physicalRows'],'gates':rows,'uniquePlayers':c['uniquePlayers'],'strictEligibleRows':0,'approvedPrimaryEligibleRows':0,'calendarCandidateEligibleRows':candidate[-1]})
report={'version':'m61-gate-comparison-1','strictAuditSha256':hashlib.sha256((R/'reports/m6-simulation-gate-audit.json').read_bytes()).hexdigest(),'gateDefinitions':[{'gate':g['id'],'strictDefinition':g['requirement'],'modelDefinition':'Applicable historical position evidence bundle is nonempty as of decision; includes carry, excludes undated current NBA/MLB lists' if i==7 else g['requirement']} for i,g in enumerate(old['gates'])],'physicalRows':sum(c['physicalRows'] for c in cohorts),'cohorts':cohorts,'strictDefinitionsAndResultsPreserved':True,'overlapWarning':'Independent failures overlap; sequential newly excluded counts do not. Original strict overlap signatures remain unchanged.','modelPositionGate':'The constructed model uses applicable historical position bundles at G08, a conservative stronger test than source-row presence. G10 still requires the declared chronology; all primary G09/G10/G11 remain blocked by absent reliable completion/schedule chronology. Calendar sensitivity is never primary eligibility.','approvedPrimaryRows':0,'sourceCalendarCandidateRows':sum(c['calendarCandidateEligibleRows'] for c in cohorts),'strictRows':0,'productionWrites':0}
(R/'reports/m61-gate-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
