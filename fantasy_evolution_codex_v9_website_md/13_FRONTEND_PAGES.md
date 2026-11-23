# Frontend website: pages and interaction requirements

Build a polished, responsive fantasy-sports product, not a generic admin scaffold. Primary navigation: Dashboard, My Leagues, Players, Draft, Matchups, Waivers, Trades, Standings, Settings. Support mobile and desktop, keyboard navigation, empty states, errors, loading states, accessible contrast, skeletons and meaningful charts.

## Pages
- `/`: product overview, sports supported, create/join CTA and auth links.
- `/sign-in`, `/sign-up`: secure authentication, form validation, recovery flow.
- `/dashboard`: user's active leagues, upcoming locks, pending trades, waiver status, next matchups.
- `/leagues/new`: select multi-sport/single-sport, dynasty/redraft, team count, starter arrays and scoring preset.
- `/leagues/[id]`: overview, league news, commissioner settings, sport subtotals.
- `/leagues/[id]/teams/[teamId]`: roster by sport, bench, IR, eligibility, lineup editor with pregame lock times.
- `/leagues/[id]/draft`: live draft board, pick timer, queue, position filters, autodraft, tradeable picks if enabled.
- `/leagues/[id]/players`: sortable/searchable stats, sport filters, eligibility, add/drop controls, player detail.
- `/leagues/[id]/matchups`: daily/weekly head-to-head totals, score breakdowns, corrections.
- `/leagues/[id]/standings`: multi-sport totals, W-L, tiebreakers and historical seasons.
- `/leagues/[id]/waivers`: FAAB bids, waiver priority, deadlines and results.
- `/leagues/[id]/trades`: offer, counter, accept/reject, approval flow, history.
- `/leagues/[id]/settings`: commissioner-only league rules, slot arrays, scoring editor, audit log.
- `/admin/simulation`: data coverage, backtest runs, spread charts, position diagnostics and holdout report.

## Acceptance
Use realistic demo data so a new visitor can explore a complete league without external API keys. All buttons must do real work; no inert placeholder links. Add Playwright coverage for create league, draft, lineup lock, waiver, trade and scoring correction.
