# M4.2 competition checkpoint

M4.2 now has immutable per-cycle configuration snapshots, independent sport competition records, exact game-to-period attribution, provisional matchup revisions with a 24-hour finalization worker, recorded idempotent random draws, approved H2H standings logic, exact rational championship-point calculations, fixed six-team playoff/bracket planning, and cumulative configuration that creates neither matchups nor playoffs.

NFL source-backed provisioning includes Week 18 only for cumulative competition. H2H uses Weeks 1–17 and schedules three playoff weeks backward from Week 17. Other sports require authoritative UTC games. Normal competitive leagues can no longer invoke the legacy calendar-guessing schedule generator; missing schedules remain `PENDING_DATA`. Historical replay retains its explicitly labeled legacy path.

Remaining M4.2 work is tracked rather than implied complete: persistent bracket progression and final placements, persisted championship-point projection/finalization, overall championship aggregation, complete cumulative starter-ledger aggregation, and correction-driven standings snapshots. These are independent of the completed V5 import but depend on the lineup snapshots introduced with M4.3.
