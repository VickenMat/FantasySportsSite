# M5 free-first hybrid provider comparison


## November 26 real-source continuation

Bounded downloads now use the published CC BY 4.0 nflverse statistics/roster releases and SportsDataverse data releases. The latter identifies its **data** license in its [README](https://github.com/sportsdataverse/sportsdataverse-data/blob/main/README.md); its software MIT license is a separate grant. These are attributed redistribution sources; direct NBA/NHL/MLB/ESPN endpoints remain disabled. Current-source records, exact hashes, canonical matching, missing evidence and isolated acceptance are detailed in [the real-data review](M5_REAL_DATA_REVIEW.md) and the real integration report. No logo/headshot assets or paid services are used.

Retrosheet's [notice](https://www.retrosheet.org/notice.txt) permits commercial use with its required prominent attribution. Its available historical release does not cover the imported 2026 MLB target, so it does not resolve those current gaps. No unnecessary historical download was performed. Batch release modification/fetch times do not supply official publication or game completion instants, and these sources provide no demonstrated 60-second live SLA.


Research date: November 25, 2026 (America/Los_Angeles). The approved strategy is $0 subscriptions, one internal hybrid service, and ESPN/shared coverage first where permitted. Commercial options are optional future extensions. Public documentation availability is not an API credential, license grant, SLA or successful data integration. Unknown product fields remain unknown.

## Approved development direction

The shared HTTPS service implements bounded bodies/timeouts/redirects, allowlisted hosts, conditional caching and Retry-After; adaptive polling is computed per professional game with provider minimums. Scheduling and rolling provider-wide quotas remain implementation work. No continuous live network job is active.

ESPN remains a candidate, not an approved automated source: [Disney terms covering ESPN](https://disneytermsofuse.com/english/) restrict automated collection/business use absent permission. Research-tool scoreboard probes did not establish endpoint access; they are not outage evidence. No bypass was attempted.

NFLverse's [data license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md) and [official player loader](https://github.com/nflverse/nflreadr/blob/main/R/load_players.R) support a bounded attributed player-identity preview. One real preview fetched 24,872 rows: 18,793 standard GSIS identities, 6,079 unsupported primary IDs held out, zero contradictory primary-ID records. The preview writes only ignored files, never eligibility, lifecycle, official publication or operational data. It is not live statistics coverage. Current NBA official positions remain permission-gated; recovered NBA estimates are not substitutes.

Recovered historical sources remove the need to reacquire matching archives. Their local evidence and outstanding targeted NHL requests are detailed in [the recovered-source review](M5_RECOVERED_DATA_REVIEW.md).

## Coverage matrix

| Candidate | Sports/history/live | IDs and positions | Availability, rookie, retirement | Schedules/status/corrections/publication |
| --- | --- | --- | --- | --- |
| NFL official/authorized league feed | NFL; required 2016–2026/live coverage needs negotiated scope | Source-specific IDs/crosswalk and positions require feed validation | Require explicit licensed fields | Official channel candidate; endpoint access and publication/completion semantics unverified |
| nflverse/nflreadr | NFL annual public datasets; exact requested release manifests need validation; not a low-latency live SLA | Dataset IDs, rosters and player mappings; per-dataset validation required | Injury/depth-chart datasets exist; rookie/retirement authority not established | Schedule updates and corrected statistical refreshes documented; fetch/release time is not proven official publication |
| MLB Stats API / official MLB | MLB; metadata endpoint returned JSON; historical/live product scope unapproved | Candidate MLB player/team/game identifiers; fielding detail must satisfy 10/20 rule | Roster/status fields are not automatically IR/rookie/retirement evidence | Public schedule/box-score interface candidate; official publication/completion instants not verified |
| Retrosheet | Baseball historical candidate; current required-year coverage not verified here | Historical IDs need explicit crosswalk; fielding source review needed | Not established as current lifecycle source | Candidate historical event archive, not selected live/correction provider |
| NBA official / nba_api | NBA public statistics interfaces and a community client; no approved fantasy feed | Player/team/game IDs and position endpoints require crosswalk/sample review | Current lifecycle completeness not established | Current endpoint access was not established by this research environment; no measured live reliability or publication guarantees |
| NHL official endpoints | NHL schedule/roster/box-score candidate; access probe unsuccessful in research tool | NHL IDs and positions need documented mapping/sample validation | Lifecycle meanings and completeness unverified | Integer faceoff wins, explicit shorthanded points, goalie decisions and shutout evidence must be sampled; no inferred substitutes |
| SportsDataIO | Documented NFL/MLB/NBA/NHL APIs; contracted historical years and live tiers must be confirmed | Documented player endpoints; pure PlayerID/name codec implemented; positions need evidence mapping | Injury/roster feeds marketed; required rookie/retirement completeness must be demonstrated | Schedules, scores and stats offered; raw status/update fields alone do not establish official publication or exact completion instants |
| Sportradar | Documented NFL/MLB/NBA/NHL B2B APIs; historical-year/endpoint matrix must be scoped | Provider-specific canonical mappings required; no sample credentials used | Feed/league-specific validation required | Workflow/change feeds are candidates; required publication, correction and completion semantics must be demonstrated |
| MySportsFeeds | Additional multi-sport candidate; current site access/coverage not verified | Unknown in this review | Unknown | Unknown; not recommended for activation until independently verified |

## Operations, pricing and rights

| Candidate | Authentication / rate limits | Reliability / expected latency | Cost / usage restrictions | Complexity and decision |
| --- | --- | --- | --- | --- |
| NFL official | Authorization/contract and limits unverified | No measured availability/SLA here | Quote and written scope required | High until feed access is established |
| nflverse | Public releases; GitHub distribution limits apply, not an unlimited service contract | Stats refresh after games; schedule cadence differs; no contractual SLA | Repository data license is CC BY 4.0; package MIT license is separate. Review individual upstream datasets and attribution before use | Low/medium for historical NFL; not a replacement for verified live/publication evidence |
| MLB public | Metadata accessible without key; published supported commercial API limits not established | No measured SLA/latency | Automated collection is restricted; permission remains unresolved. | Medium technical, licensing blocked |
| Retrosheet | Current access/rate and license scope unverified | Historical batch candidate | No commercial permission assumed; review current terms first | Medium crosswalk/fielding work; deferred |
| NBA public/client | Community client does not confer supported API access or limits | No measured SLA/latency; unsuccessful research access is not proof of outage | Fantasy use needs prior permission; client licensing does not grant data rights. | Blocked for automatic fantasy ingestion without permission |
| NHL public | Access/rates unverified | No measured SLA/latency | Automated fantasy-ingestion rights are not established; permission needed. | Medium/high field mapping; blocked pending rights |
| SportsDataIO commercial | API key; commercial pricing page advertises unlimited calls, but operational limits still need confirmation | Contract/sample-specific; no numerical latency promised here | Custom quote, no published general price list; raw-feed resale excluded, retention/attribution depend on agreement | Optional future commercial candidate; not required for development |
| SportsDataIO Discovery Lab | Account; free prior-season exploration and paid personal packages | Lighter personal product; not assumed equivalent to commercial live tier | Personal/non-commercial only; not a license for the public fantasy site. No account created or payment made | Optional private research subject to permitted scope, not production fallback |
| Sportradar | API key; documented default trial: 30 days, 1,000 requests/rolling 30 days, 1 QPS; production limits per product | Contract/sample-specific; no measured SLA/latency here | Commercial price requires quote; trial rights do not establish production redistribution permission | Recommended alternate commercial quote candidate |
| MySportsFeeds | Unverified | Unverified | No current quote/rights verified | Additional candidate only; no speculative price or reliability claims |

## Free-first source plan

| Sport | Historical sources | Current/live gaps | Future optional extension |
| --- | --- | --- | --- |
| NFL | Preserve accepted/recovered archives; attributed NFLverse identity preview | Evaluate permitted shared coverage and NFLverse dataset cadence; official publication remains unknown | Commercial only for a later approved need |
| MLB | Approved conservative recorded-count historical repair | Permitted shared coverage, then official sport gap-fill; current eligibility needs dated evidence | Optional commercial gap-fill |
| NBA | Preserve archive and estimated/manual historical position provenance | Obtain permitted current positions; estimates cannot substitute | Optional commercial gap-fill |
| NHL | Preserve archive; canonical requests only for missing scoring fields | Permitted shared/official gap-fill with exact fields and timestamps | Optional commercial gap-fill |

No continuous live feed is active. One attributed open-data identity preview does not establish production fantasy coverage. The internal hybrid service supports multiple products without separate provider applications. Commercial quotes are not prerequisites for remaining implementation.

## Proposed polling budget, inactive

Start with conservative proposed intervals only after vendor confirmation: identities/rosters 24 hours, schedules 6 hours away from games, availability 30 minutes around active game windows, active aggregate stats 60 seconds only if licensed/necessary, final reconciliation 15 minutes initially then daily. These are proposals, not running network jobs. Each endpoint/key gets an independent budget, lease, timeout, maximum page size and Retry-After backoff. Confirm actual cache/limit behavior before deployment.

At 60 seconds, one request per active game for a three-hour window costs 180 calls/game; an aggregate endpoint costs 180 calls for the whole window. Thirty two-game days imply about 10,800 per-game calls versus 5,400 aggregate calls, before other endpoints. Either exceeds a 1,000-call trial; trial evaluation must use a bounded sampling plan. Persisted fixture request ceilings are tested, but full vendor rolling-window enforcement remains open.

## Primary research sources and access evidence

- [SportsDataIO pricing](https://sportsdata.io/pricing): quoted commercial scope, advertised call pricing and license structure. [Data rights FAQ](https://sportsdata.io/help/data-rights-and-licensing-questions): display/storage/retention, attribution, Discovery Lab restrictions.
- SportsDataIO documented interfaces: [NFL](https://sportsdata.io/developers/api-documentation/nfl), [MLB](https://sportsdata.io/developers/api-documentation/mlb), [NBA](https://sportsdata.io/developers/api-documentation/nba), [NHL](https://sportsdata.io/developers/api-documentation/nhl). Documentation accessible; authenticated payloads not requested.
- [Sportradar getting started](https://developer.sportradar.com/getting-started/docs/get-started) and [account/trial limits](https://developer.sportradar.com/football/docs/football-ig-account-maintenance). Documentation accessible; no trial/account created.
- [nflverse data license](https://raw.githubusercontent.com/nflverse/nflverse-data/main/LICENSE.md), [nflreadr](https://nflreadr.nflverse.com/), [dataset cadence](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html). License and update documentation accessible; no release imported.
- [MLB metadata endpoint](https://statsapi.mlb.com/api/v1/sports) returned JSON; [MLB terms](https://www.mlb.com/official-information/terms-of-use) require a separate permission review for automated collection.
- [NBA terms](https://www.nba.com/termsofuse) and [nba_api project](https://github.com/swar/nba_api). Public client code is not a data license. NBA API hub access was unsuccessful in the research tool; no bypass attempted.
- [NHL terms](https://www.nhl.com/info/terms-of-service), [schedule candidate](https://api-web.nhle.com/v1/schedule/now), [NFL portal candidate](https://developer.nfl.com/), [Retrosheet notice candidate](https://www.retrosheet.org/notice.htm), [MySportsFeeds pricing candidate](https://www.mysportsfeeds.com/data-feeds/pricing/). The latter endpoint/notice/portal probes did not establish current access or rights; no outage, coverage or price is inferred from that limitation.
