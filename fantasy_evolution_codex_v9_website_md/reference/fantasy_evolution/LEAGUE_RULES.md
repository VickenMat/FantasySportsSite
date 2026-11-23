# Fantasy Evolution | League rules (draft v0.4)

## Roster presets
The authoritative arrays are in SETTINGS_SCHEMA.json. Multi-sport Balanced presets contain **9 Standard**, **10 Deep**, or **12 Expanded** starters **per selected sport**. Each sport has 5 dedicated bench slots, plus 5 shared universal bench and 5 shared IR slots. Single-sport defaults use their own templates, not the multi-sport template.

### Position eligibility
- MLB `MI` accepts `2B` or `SS`.
- NBA `F/C` accepts `SF`, `PF`, or `C`. This is eligibility for a lineup slot, not a new real-world position.
- NFL IR eligibility: IR, Out, Suspended. MLB single-sport IL eligibility: 10-day IL or longer.
- Other flexible slot eligibility and injury-status mapping are pending exact definition.

### Two-way players
One immutable athlete identity and one roster spot. Shohei Ohtani can be used as a pitcher or hitter; Travis Hunter can have WR/DB eligibility, although default NFL roster/scoring has no DB slot. For overlapping games, a manager selects **one** scoring role, or benches the athlete. Only statistics belonging to the chosen scoring role count. A player cannot collect simultaneous hitting and pitching fantasy points from one roster assignment. Role assignment timing and games with staggered start times require explicit tests.

### Game locking
Each athlete's game appearance locks at the **officially scheduled start time**, not the first play or a manager's observation. A locked player cannot be moved, benched, cut, or traded while locked. Other not-yet-started players remain movable. Exact postgame unlock and postponement policy are pending.

### Invalid dynasty rosters
At a sport's season conclusion, its IR players leave IR and count against regular capacity. If over limit, the franchise becomes invalid. It cannot add players or propose outgoing trades, but can **accept** an incoming trade even if this worsens the invalid state; can cut unlocked players. Existing starters stay fixed and continue accruing points. Invalidity does not cause automatic benching or forfeiture. An accepted trade cannot bypass the independent game-lock rule.

### Offseason and season identity
Redraft: when a selected sport ends, its athletes remain on roster and are locked against transactions until the overall league season finishes and redraft rollover occurs. Dynasty: rostered athletes persist, transactions continue subject to eligibility and validity; inactive sports produce no further points. Season identity uses the year the professional season began: MLB 2027 + NFL 2027. Competitive period spans earliest selected regular-season start to latest selected regular-season end; pro playoffs excluded by default.

### Drafts
Redraft: universal snake/auction and sport-rotation snake/auction. Dynasty: those four plus progressive and protected-franchise. One eligible player pool across all selected sports. Real ADP is observed average draft position from completed real drafts, segmented by settings; projected fantasy points are distinct. Keeper toggle applies only to redraft.

### Scoring and competition
Single sport uses ESPN-inspired presets from SCORING_PRESETS.json, not UBP. Multi sport defaults to UBP and cumulative competition only. UBP balances **full-season output of representative starting lineups** across sports, not individual star ceilings. Numeric weights and calibration await historical data. Scoring settings lock on league scoring activation; roster changes permitted before draft and after affected sport season for a future season only.

## v0.6 confirmed amendments
See `WAIVERS_AND_SCORING_V06.md` for authoritative FLEX/SUPERFLEX/UTIL eligibility, acquisition timing, and one-decimal UBP weight precision. These amendments supersede any older text marking these specific slot eligibility rules as TBD.

## v0.7 overrides
- NHL UTIL: forwards or defensemen only; never goalies.
- FAAB: sealed bids during a rolling 24-hour waiver restriction; highest valid bid wins on expiry, otherwise free pickup. New completed games reset waiver expiration.
