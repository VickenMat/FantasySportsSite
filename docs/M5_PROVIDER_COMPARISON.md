# M5 provider comparison and conditional recommendations

Research date: November 25, 2026 (America/Los_Angeles). User confirms no existing license: prepare options, purchase nothing, activate no feed. Public documentation availability is not an API credential, license grant, SLA or successful data integration. Unknown product fields remain unknown.

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
| SportsDataIO commercial | API key; commercial pricing page advertises unlimited calls, but operational limits still need confirmation | Contract/sample-specific; no numerical latency promised here | Custom quote, no published general price list; raw-feed resale excluded, retention/attribution depend on agreement | Recommended first commercial quote candidate, not an approved selection |
| SportsDataIO Discovery Lab | Account; free prior-season exploration and paid personal packages | Lighter personal product; not assumed equivalent to commercial live tier | Personal/non-commercial only; not a license for the public fantasy site. No account created or payment made | Optional private research subject to permitted scope, not production fallback |
| Sportradar | API key; documented default trial: 30 days, 1,000 requests/rolling 30 days, 1 QPS; production limits per product | Contract/sample-specific; no measured SLA/latency here | Commercial price requires quote; trial rights do not establish production redistribution permission | Recommended alternate commercial quote candidate |
| MySportsFeeds | Unverified | Unverified | No current quote/rights verified | Additional candidate only; no speculative price or reliability claims |

## Primary/fallback recommendation by category

These are engineering recommendations conditional on written rights, exact field coverage and price approval.

| Sport | Historical identity/statistics | Current positions/availability/lifecycle | Schedule/game-state/live statistics | Official publication/corrections |
| --- | --- | --- | --- | --- |
| NFL | Preserve accepted archive; evaluate nflverse releases with attribution; licensed commercial fallback | SportsDataIO quote candidate; Sportradar alternate; nflverse roster/injury supplementary only after field review | SportsDataIO primary quote, Sportradar fallback; nflverse delayed reconciliation where permitted | Whichever contracted provider explicitly supplies the required source timestamps; otherwise pending |
| MLB | Preserve archive; review licensed box scores/fielding and Retrosheet separately | Licensed per-game fielding starts/appearances; never infer positions from roles | SportsDataIO primary quote, Sportradar alternate; official Stats API only with appropriate permission | Explicitly verified publication/completion fields required; status alone is insufficient |
| NBA | Preserve archive; obtain permitted historical position source | Licensed positions/status, with identity/time validation | SportsDataIO primary quote, Sportradar alternate; no automatic nba_api fantasy fallback | Contract/sample verification required |
| NHL | Preserve archive; obtain exact missing V9 inputs | Licensed positions/status and explicit lifecycle evidence | SportsDataIO primary quote, Sportradar alternate; public endpoints only with permission | Exact completion/publication evidence required; never use fetch time |

No provider is approved or activated. A commercial choice requires a written quote covering all four sports, 2016–2026 history plus NBA/NHL 2026–27, fantasy display, storage, derived V9 output, attribution, post-termination retention, freshness/SLA, and exact missing fields. A provider can be primary for one category and insufficient for another.

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
