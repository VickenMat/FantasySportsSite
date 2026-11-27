"""Current 74-item delivery report from verified receipts and campaign artifacts."""
import json,statistics
from pathlib import Path
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((R/p).read_text())
method=read('reports/m61-approved-methodology.json');accepted=read('reports/m61-accepted-cohorts.json');gates=read('reports/m61-gate-comparison.json');analysis=read('reports/m61-campaign-analysis.json');tests=read('reports/m61-acceptance.json')
primary=[r for r in analysis['records'] if r['variant']=='primarySourceCalendar'];sample=next(r for r in primary if r['seed']==31)
status={'version':'m61-baseline-status-1','methodologyApproved':True,'methodologyFingerprint':method['fingerprint'],'acceptedCohortFingerprint':accepted['fingerprint'],'acceptedSportSeasons':0,'acceptedCompleteFourSportCycles':0,'strictDecisionEligibleRows':0,'primaryApprovedDecisionEligibleRows':0,'sourceCalendarCandidateRowsNotPrimary':gates['sourceCalendarCandidateRows'],'acceptedCampaignsExecuted':0,'diagnosticLeaguesExecuted':len(analysis['records']),'primarySourceCalendarSeeds':[r['seed'] for r in primary],'officialMedians':dict.fromkeys(['NFL','MLB','NBA','NHL']),'officialMedianSpreadPercent':None,'officialMeanSpreadPercent':None,'milestones':{'M6.0':'ACCEPTED_PREPARATION','M6.1':'NOT_ACCEPTED_COHORT_EVIDENCE','M6.2':'ACCEPTED_EXTENDED_WITH_REAL_DIAGNOSTICS','M6.3':'NOT_ACCEPTED_NO_COMPLETE_BASELINE'},'checklist':{'checked':19,'total':28},'v10OptimizationReady':False,'v10Active':False,'productionWrites':0,'blockers':['No independently accepted closed comparable four-sport inventory','No reliable completion UTC day/schedule-publication history for primary D1/D3','Missing athlete/game appearances remain UNKNOWN, not explicit nonparticipation','NHL field and adaptive-strategy uncertainty not defensibly bounded below0.5%','2025 already exposed in historical diagnostics; no untouched retrospective holdout established']}
(R/'reports/m61-baseline-status.json').write_text(json.dumps(status,indent=2)+'\n')
items=[
('Latest Git checkpoint','Starting a13deab; verified implementation and final synchronization receipt are committed normally. See reports/m61-git-checkpoint.json.'),
('GitHub synchronization','Normal non-force push to origin/main under standing authorization; final receipt records verified equality.'),
('Working tree','Clean after final commit/push; large source and derived files remain excluded.'),
('Development preservation','Read-only before/after fingerprints across90tables; only named runtime bookkeeping differences permitted. No migration/backfill/ownership/financial/competitive write.196FKs checked.'),
('Source preservation','All four archives/seven recovered CSVs and three user screenshots preserved.'),
('V5 preservation','All five accepted V5 artifacts and existing55Parquets/eleven frozen gate files preserved; no acquisition restart.'),
('V9 preservation','All56rules remain unchanged; production scoring reused, no optimizer or V10 activated.'),
('D1 UTC convention','Verified completion UTC day D →00:00 UTC D+2; later actual completion day prevails. Weekly first Wednesday12:00 UTC after that safety floor. No scheduled-date replacement for unknown completion day.'),
('D2 positions','Applicable dated observations and qualifying prior carry; MLB10-start/20-appearance thresholds after knowledge; prior NBA estimate variant only. Undated current NBA lists do not create dated positions.'),
('D3 discovery/continuity','Prior supported pool plus delayed new observations, latest team continuity, prior-only participation heuristic, unknown health/IR/rookie status preserved.'),
('D4 roster management','Confirmed66seatcapacity;2/1/1/1 rotation balanced five extra allocations per sport per20seedgroup; individual-game primary and daily-freeze control.'),
('D5 rankings/seeds','Exact V9 trailing20/shrink4 preserved; V5/prior-only comparisons. All60seeds preregistered. Only31–50 used for this2023validation-source diagnostic.'),
('D6 season acceptance','All44cohorts compared against V5; retained native NHL info added. Named reconciled alternative requires review, not automatic official acceptance.'),
('Frozen methodology fingerprint',method['fingerprint']),
('Strict/model waterfall',f"Strict0, approved primary0; source-calendar candidate rows {gates['sourceCalendarCandidateRows']:,}. Independent and sequential failures distinguished. G08 constructed applicability and strict raw presence explicitly distinguished; no overwrite."),
('Eligible rows/players/player-seasons','Accepted primary rows/players/player-seasons0; candidate source-calendar counts per44cohorts remain separately measured in position/discovery and gate reports.'),
('Eligible sport-seasons','Zero accepted; source qualification and high observed game coverage do not satisfy full inventory/chronology acceptance.'),
('Accepted complete cycles','Zero. Calendar-year NFL/MLB Y paired with NBA/NHL starting-yearY; no outcome-selected remapping.'),
('Excluded cohorts','All remain primary-blocked by inventory/completion chronology.2019/20also COVID comparability;2026partial;2025reserved;2016has no2015warmup and no realistic preseason draftable pool.'),
('Season inventory','2023observedNFL272/MLB2430/NBA1230/NHL1312, no V5 final game missing archive membership. NHL independent-table info also1312, shared upstream lineage disclosed; not independently certified closed totals.'),
('Position coverage','All44cohorts have prior carry/current/estimated/family/unknown metrics and position-specific draft counts. Actual2023drafts fill all108required starter seats per sport.'),
('Discovery coverage','Last-observed prior pool and delayed current discovery measured. Future-only players cannot appear in earlier drafts; discovered does not imply starting eligibility.'),
('Participation coverage','PLAYED/DNP/UNKNOWN remain separate. Unknown/missing appearances stay in unresolved starter denominators; no absence→DNP expansion.'),
('Accepted cohort fingerprint',accepted['fingerprint']),
('NFL missing IDs','186remain quarantined:181nameless/fourTeam/oneR.Rodgers. No nonzero supplied V9 input or secondary native ID permits a safe attribution.'),
('MLB unresolved roles','35of54,992paired keys remain roleless;52,737PITCHER/2,220HITTER selected. Two imported participation/inventory cases remain held; older favorable classifications do not override later guards.'),
('NHL shutouts','1979unknown credits remain unknown; binary missing-component range0..370,073tenths over the entire archive is not a baseline estimate.'),
('NHL faceoffs','252played skater rows remain missing exact faceoff wins; no integer derivation from percentages.'),
('NHL shorthanded','360played rows remain missing SHpoints. A supported per-appearance component range may use known goals+assists; never source zero filling.'),
('NHL goalie wins','Fiveplayed rows lack exact decision; binary uncertainty treatment is separate from actual statistics.'),
('Fixed-assignment bounds','Production scorer evaluates scenario corners on copies. Binary SO/win and supported SH ranges may be finite; unknown faceoffs/absent outcomes leave affected assignment totals unbounded.'),
('Adaptive uncertainty','Paired low/high SO histories rerun drafts/projections/lineups/waivers. They are scenarios, never proven adaptive global extrema.'),
('Selection bias','Measured by season/player/game/team/position/prior-performance tier, plus actually drafted/started traces. Unknown injury/rookie classes and unobserved transactions remain unidentified.'),
('Materiality versus0.5%','Cannot certify uncertainty below0.5%; unresolved complete outcomes and strategy feedback lack a supported global finite bound.'),
('Accepted historical campaigns','Zero accepted baseline campaigns; '+str(len(analysis['records']))+' real source-calendar diagnostic leagues executed across four sports.'),
('Seasons/seeds','2023target,2022warmup. Twentyvalidation seeds31–50, plus eight one-dimension/scenario runs at31; no2025or51–70 campaign.'),
('NFL official median','Unknown/null. Known incomplete starter totals appear only in diagnostic tables below.'),
('MLB official median','Unknown/null; absent outcomes and eligibility evidence remain explicit.'),
('NBA official median','Unknown/null; prior family/granular versus estimates remain separately compiled.'),
('NHL official median','Unknown/null; known totals do not fill SO or absent outcomes.'),
('Confirmed median spread','Official value null. Formula preserved: sport median range / mean of four sport medians ×100.'),
('Mean secondary spread','Official value null; no mean-based substitution for confirmed primary objective.'),
('Per-season results','Only2023source-calendar diagnostic; no full historical comparative-season claim or shortened-season normalization.'),
('Franchise distributions','Per-franchise known totals, unresolved sport counts, medians/means/ranges/std/IQR in CSV/private traces and compact analysis. Not complete scores.'),
('Starter appearances','Known/unknown/explicitDNP counts preserved by sport/seed; unknown assignments never disappear from denominators.'),
('Position contributions','Actual locked-slot known points, unique starters, conditional medians and unknown counts recorded. Counts are diagnostic, not accepted role-balance results.'),
('Draft-round contributions','Attribution follows actual draft and later waiver acquisition before each locked appearance.'),
('Waiver contributions','Claims/wins/FAAB and actual postacquisition known points recorded, with one owner and legal capacity.'),
('Replacement value','Prelock eligible actually unowned expected replacement, not arbitrary universal thresholds or hindsight actual replacement. Missing inputs prevent complete actual points-above-replacement claims.'),
('QB/SUPERFLEX','Known QB share and SUPERFLEX positional occupancy reported under confirmed roster; no QB coefficient changes.'),
('Two-day/weekly sensitivity','Paired seed31control. Weekly batching preserves distinct effective observation order; regression proves no collapsed duplicate roster facts.'),
('NBA position sensitivity','Prior-season estimate variant paired at31; target-season retrospective estimates never grant early eligibility.'),
('Movement sensitivity','Individual-game versus daily-first-start freeze, same source stats and initial draft; final knowledge remains conservative/source-calendar diagnostic.'),
('Ranking sensitivity','V9 versus V5 versus prior-only at31, one dimension changed; no outcome-selected primary.'),
('Shared bench control','Unused shared bench seats compared at31; approved rotating allocation remains primary.'),
('Seed variability','Twentyfull-league seed observations; report conditional seed standard deviations, not independent-franchise confidence intervals.'),
('Season variability','Not estimated from a single unaccepted source-calendar cycle.'),
('Method uncertainty','Paired differences quantify conditional source-calendar sensitivity only, not validity of unverified completion/source assumptions.'),
('Historical leakage acceptance','Real NFL/MLB/NBA/NHL cases verify future outcomes/positions/rosters/availability cannot affect earlier decisions; earlier waiver claims unchanged; reordering stable.'),
('Holdout exposure','Published V4 calibration and preparation statistics include2025; not untouched. Reserved seed/season campaigns remain sealed going forward; prospective replacement proposal is not automatically approved.'),
('Automated tests','367units;20Python;164normal+164shuffled integrations(seed261129);20standard Chromium+2restart+3separate real-source/population checks. TypeScript/lint/Prisma/Webpack pass, audit0.'),
('Historical reproducibility','Independent replay of representative full source-calendar cycle matches output fingerprint; inputs/provenance hash-verified. No accepted complete baseline exists to replay.'),
('Performance','20seed and eight sensitivity elapsed/RSS plus215-second-class compilation benchmark recorded. Timings are environment measurements, not guarantees.'),
('M4 regression','All existing gameplay suites preserved; no assertions/deadlines weakened. Initial signup timeout recovered in serial rerun; no claim it was a gameplay fix.'),
('M5 health','Twentyproducts/both recurring policies remain enabled; managed workers/site/database verified. Existing League1blocked draft retained. Genuine live chronology remains unverified.'),
('Fingerprints','Read-only before/after table/source receipts,66frozen partition/gate checks,16diagnostic snapshot SHAchecks, exact V9fingerprint and runtime dependency closure retained.'),
('Checklist','19/28fixed tasks; no restructuring or inflated task count. Six later phases remain outside scope.'),
('M6.1 accepted?','No: D1–D6policy is implemented/approved, but comparable cohort evidence and statistical acceptance are not satisfied.'),
('M6.2 accepted?','Yes: mechanical foundation remains accepted, extended with real chronological diagnostic campaigns and leakage checks.'),
('M6.3 accepted?','No: no accepted complete comparable historical baseline or official spread.'),
('Reliable enough for V10?','No; no optimization search, new weights or activation occurred.'),
('External dependencies','Supported completion/resumption UTC days and schedule chronology; closed inventories; complete appearance/nonparticipation evidence; remaining exact NHL fields.'),
('Remaining methodology decisions','D1–D6not reopened. Inventory alternative, any new completion-date approximation or new uncertainty treatment requires separate concrete review; missing facts are not product choices.'),
('Before M6.4','Accept exact comparable evidence/cohort manifest; settle/bound missing outcomes and adaptive bias; run unchanged V9primary and required accepted sensitivities; verify official medians/spread/uncertainty; then review optimization authorization.')]
assert len(items)==74,len(items)
lines=['# M6.1 methodology execution and M6.3 baseline evidence','','November 27, 2026 Pacific. D1–D6 are approved and implemented offline. **M6.1 and M6.3 remain unaccepted because cohort and statistical evidence is insufficient. Those decisions do not require repeat approval.** M6.0 and M6.2 remain accepted in their scopes; checklist 19/28. No V10 optimization, production backfill or migration, contract automation, or M7.','','[Frozen method](M6_APPROVED_METHODOLOGY.md) · [cohort evidence review](M6_COHORT_EVIDENCE_REVIEW.md) · [optimization handoff](M6_OPTIMIZATION_READINESS.md).','','## Required delivery A–H, all 74 items','','| # | Item | Evidence/result |','| --- | --- | --- |']
for i,(title,value) in enumerate(items,1):lines.append(f'| {i} | {title} | {value} |')
lines+=['','## Actual real-data diagnostic results — not accepted baseline','','The table reports known incomplete starter points for seed31, not actual complete franchise medians. Unknown assignments remain unresolved. No cross-sport spread is calculated from them.','','| Sport | Known-point median (points) | Known scored appearances | Unresolved assignments | Unfilled draft starter seats |','| --- | ---: | ---: | ---: | ---: |']
for row in sample['sports']:lines.append(f"| {row['sport']} | {row['knownPointMedianTenths']/10:,.2f} | {row['knownScoredAppearances']:,} | {row['unresolvedStarterAssignments']:,} | {row['draftUnfilledStarterSeats']} |")
lines+=['','Twenty source-calendar control seeds rotate the fifth bench seat equally. Eight paired sensitivity/scenario runs use31. Full trace data stay ignored. [Compact campaign analysis](../reports/m61-campaign-analysis.json), [franchise diagnostic CSV](../reports/m61-franchise-diagnostics.csv), [strict/model gate comparison](../reports/m61-gate-comparison.json), [all44cohort inventory](../reports/m61-season-inventory.json), [position/discovery coverage](../reports/m61-position-discovery-coverage.json), [missingness](../reports/m61-missingness-bias.json), [uncertainty](../reports/m61-statistical-uncertainty.json), [acceptance](../reports/m61-acceptance.json), [preservation](../reports/m61-preservation.json), [dependency/data verification](../reports/m61-evidence-verification.json), [holdout audit](../reports/m61-holdout-exposure.json).','','The coverage field modeledPriorPlayers counts all discovered prior identities, including unsupported professional roles; it is not a count of draftable players. The separately reported eligible/drafted pools prevent conflating those denominators. NBA native game/side team bridge conflicts are quarantined as team-season mappings; no first-duplicate or name-based resolution is used.','','## Reproduction','','```sh','node --import tsx src/workers/freeze-m61-methodology.ts','python3 scripts/prepare-m61-history.py --snapshot-year 2023','python3 scripts/report-m61-gates.py','python3 scripts/audit-m61-holdout.py','python3 scripts/audit-m61-missingness.py','node --import tsx src/workers/run-m61-historical-diagnostics.ts 2023 31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50','node --import tsx src/workers/run-m61-historical-diagnostics.ts 2023 31 weekly,nbaPriorEstimate,dailyFreeze,v5,priorOnly,unusedBench,soLow,soHigh','node --import tsx src/workers/verify-m61-historical-leakage.ts','python3 scripts/report-m61-campaigns.py','node scripts/verify-m61-evidence.mjs','node scripts/verify-m61-preservation.mjs --before data/operations/m61_before_preservation.json --output reports/m61-preservation.json','python3 scripts/report-m61-methodology.py','python3 scripts/report-m61-execution.py','```','','Verification/preservation receipts are produced by the read-only acceptance workflow; commands above do not mutate operational PostgreSQL. Historical raw source publication remains null, and modeled dates remain explicitly offline.']
(R/'docs/M6_METHODOLOGY_EXECUTION_REPORT.md').write_text('\n'.join(lines)+'\n')
