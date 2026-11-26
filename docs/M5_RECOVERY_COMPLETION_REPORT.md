# M5 recovered data and free-first continuation

Continued from synchronized `4c730e0`. M5 remains in progress: 11/32 whole checklist requirements are complete; partial delivery does not imply live-source acceptance. M4 remains fixture-verified at 60/60.

## Delivered

- Inventoried/fingerprinted seven immutable recovered files; verified Git exclusion. Canonical typed duplicate-aware comparison covers all 1,746,957 statistical rows. NBA has an additional historical position column; NHL multilingual name representation differs and is explicitly outside shared-value equivalence. Accepted Parquet remains unchanged.
- Reconciled MLB recorded counts without selecting duplicate lists or summing unverified team scopes. Generated provenance-bearing conservative candidates and the exact approved repair manifest. Preserved NBA estimates/manual-review/unmatched records separately and verified their relationship to embedded final-CSV and original roster data.
- Prepared canonical game/player/stat NHL requests for only missing fields; no new NHL values or zeros were invented.
- Fixed historical repair to preserve official publication timestamps, reject overlapping team/game scopes, append revisions in bounded batches, and keep repaired historical observations out of legacy current-eligibility fallback paths. Display history remains available.
- Implemented a shared bounded HTTPS transport with allowlisted HTTPS redirects, conditional cache, Retry-After and body/time limits; tested adaptive professional-game polling intervals with provider minimums. No continuous live scheduler or rolling quota claim is made.
- Added an attributed NFLverse player-identity preview under the approved $0 strategy. Real sample: 24,872 source rows, 18,793 standard GSIS identities retained, 6,079 unsupported primary IDs withheld, zero contradictory primary-ID records. No operational writes or publication/lifecycle claims.
- Extended existing V9 recalculation to preserve a selected source on replay, require an explicit review reason to change sources, retain fixed scoring roles and use the same canonical ledger. Automatic authoritative source arbitration and statistic promotion remain to implement.
- Updated the baseline audit to count latest appearances separately from revisions and retain original MLB category provenance through repair wrappers.

## Approved development application

The user explicitly approved the exact reviewed migration and MLB target. The managed development stack was paused. A fresh private 35,831,832-byte custom-format backup passed listing and full archive decode; SHA-256 `9352e3d660f1816883e2da890c0e72a397c0dce8c893ca8b9d94c0d6a0edd764`. Backup and raw/derived datasets remain excluded from Git.

Migration `20261126010000_professional_ingestion_foundation` was applied with reviewed SQL SHA `a1ba35606bfcb47197c55df87214dd0dbe3bc5c174aacd38fa6f60808c9102e0`: 26 → 27 migrations, 86 → 89 application tables, 195 → 196 foreign keys. Prisma drift is empty.

Exact MLB target `22d4af0837a85bc2f89906d7e480536f7836072f2e20e7d75fc374957e6244f4` appended 66,825 historical revisions for 935 players and one ImportBatch. Development stat revisions changed from 107,312 to 174,137; latest accepted imported appearances remain 103,801. All original rows across 86 pre-existing application tables were verified unchanged. Replay appended zero rows. No current eligibility, normalized statistics, official publication, scoring, ownership or finance data changed.

Historical MLB coverage changed from zero to 935/1,472 imported players and 66,825/72,510 latest MLB appearances. 537 player-seasons remain withheld. NBA current-season coverage and NHL unknown values remain unchanged. Exact evidence/target details: [review](M5_RECOVERED_DATA_REVIEW.md) and [machine audit](../reports/m5-recovered-data-audit.json).

The session-wide fingerprint check detected commissioner draft-configuration actions during development work: audit entries record the saved order/configuration and new fourth draft. Rate-limit/worker journal activity also advanced while the website was running. These were preserved; the immediate pre-deployment baseline includes them. Do not describe the session-wide database as wholly unchanged or reverse those actions. A fresh post-application baseline verifies subsequent automated testing separately.

## Validation

166 unit tests, 95 PostgreSQL integration tests, 17 Chromium workflows and two real server/worker restart workflows pass. A preceding independent fresh-schema run passed all 94 then-existing integration tests. Initial integration execution concurrent with the populated-copy workload hit two default five-second timeouts; the fresh isolated rerun and final expanded suite pass without weakening timeouts or assertions.

TypeScript, ESLint, Prisma validation, production Turbopack build and whitespace checks pass. The initial sandboxed build could not bind its CSS compiler port; clearing only its generated failure cache and building with required process access passed. The old preservation script flags expected approved backfill/older baseline differences; the exact deployment verifier preserves all original rows, and accepted V5 fingerprints remain identical. All 56 V9 rules remain unchanged. No V10, contract automation, archive overwrite, full historical operational import or restricted provider activation occurred. Three user-modified screenshots remain unstaged.

## Remaining work

Continue team-assignment history, position revisions/retractions, typed game-state/start/completion and availability/rookie/retirement adapters, provider-wide rolling quotas and adaptive job scheduling, automatic reviewed source arbitration, publication-aware statistical promotion, freshness/provenance UI and all-sport end-to-end acceptance. Use synthetic disposable fixtures for mechanisms when real evidence is unavailable. These are implementation requirements, not all external blockers.

External dependencies remain permitted current/live data products, authoritative source timestamp meanings, unresolved MLB role selection and positional scopes, current NBA positions and exact NHL missing inputs. Commercial subscriptions remain optional and the development budget remains $0.
