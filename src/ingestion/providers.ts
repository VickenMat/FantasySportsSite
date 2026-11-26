import type {HttpPolicy} from "./http";
/** One internal service; permission is explicit for each data product. No paid subscriptions. */
export const providerStrategy={developmentSubscriptionBudget:0,architecture:"UNIFIED_HYBRID",preferredSharedCandidate:"ESPN",livePromotionEnabled:false} as const;
export const nflversePlayerPolicy:HttpPolicy={sourceUrl:"https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",allowedHosts:["github.com","release-assets.githubusercontent.com"],maxBytes:32*1024*1024,timeoutMs:60000,permission:"OPEN_DATA_PREVIEW"};
export const providerPermissions=[
 {provider:"nflverse-players",sports:["NFL"],permission:"OPEN_DATA_PREVIEW",license:"CC-BY-4.0",cost:0,scope:"Player identity preview only; no database promotion or live publication evidence"},
 {provider:"espn",sports:["NFL","MLB","NBA","NHL"],permission:"DISABLED",reason:"Public endpoint accessibility does not establish automated fantasy use permission"},
 {provider:"mlb-stats-api",sports:["MLB"],permission:"DISABLED",reason:"Automated use permission unresolved; recovered evidence may be reconciled locally"},
 {provider:"nba-official",sports:["NBA"],permission:"DISABLED",reason:"Fantasy data permission unresolved; historical estimates do not establish current eligibility"},
 {provider:"nhl-official",sports:["NHL"],permission:"DISABLED",reason:"Automated fantasy use permission unresolved"},
] as const;
