"""Audit already-public artifacts, not new held-out scoring runs."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
paths=['fantasy_evolution_codex_v9_website_md/16_MULTISEASON_RESULTS_AND_POSITION_SCORES.md','reports/m6-v9-input-diagnostics.json','reports/m6-simulation-gate-audit.json']
evidence=[]
for p in paths:
 text=(ROOT/p).read_text();evidence.append({'path':p,'sha256':hashlib.sha256(text.encode()).hexdigest(),'prior2025Exposure':('2025' in text),'exposureType':'Published V4 optimal full-season 108-player diagnostic and 2023–2025 aggregate' if p.endswith('.md') else 'Published per-cohort statistics/coverage diagnostics, not V9 drafted league results'})
r={'version':'m61-holdout-exposure-1','season2025GenuinelyUntouched':False,'evidence':evidence,'new2025ScoringCampaigns':0,'seeds51Through70Executed':False,'policy':'Keep 2025 season campaigns and seeds51–70 sealed going forward, but never describe 2025 as historically untouched','replacementStrategy':'Preregister a prospective complete 2027-starting-year four-sport cycle before optimization; retain exposed 2025 only as a secondary future validation cohort if approved','prospectiveReplacementAccepted':False,'replacementLimitations':'2027 complete data are future/unavailable; no current independent untouched retrospective season established','weightTuningRun':False}
(ROOT/'reports/m61-holdout-exposure.json').write_text(json.dumps(r,indent=2)+'\n')
