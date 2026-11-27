/** Reviewed public calendar facts, not an automated league collector or exact event clock. */
import { mkdir, writeFile } from 'node:fs/promises';
import { fingerprint } from '@/ingestion/contracts';
import { seasonDateSnapshotSchema } from '@/scheduling/season-date-policy';
import { observedPolicyAdoptedAt } from '@/ingestion/evidence-policy';
const facts=[
 {sport:'NFL',seasonStartYear:2026,label:'2026',regularSeasonStartsOn:'2026-09-09',regularSeasonEndsOn:'2027-01-10',sourceReference:'https://www.nfl.com/news/2026-27-national-football-league-important-dates',sourceRecordPublishedDate:null},
 {sport:'NBA',seasonStartYear:2026,label:'2026-27',regularSeasonStartsOn:'2026-10-20',regularSeasonEndsOn:'2027-04-11',sourceReference:'https://www.nba.com/news/key-dates',sourceRecordPublishedDate:null},
 {sport:'NHL',seasonStartYear:2026,label:'2026-27',regularSeasonStartsOn:'2026-09-29',regularSeasonEndsOn:'2027-04-10',sourceReference:'https://www.nhl.com/news/nhl-announces-2026-27-regular-season-schedule',sourceRecordPublishedDate:'2026-07-16'},
 {sport:'MLB',seasonStartYear:2027,label:'2027',regularSeasonStartsOn:'2027-03-24',regularSeasonEndsOn:'2027-09-26',sourceReference:'https://www.mlb.com/news/mlb-2027-schedule-released',sourceRecordPublishedDate:'2026-07-16'},
].map(row=>({...row,sourceZone:row.sport==='MLB'?null:'America/New_York',precision:'DAY',source:'MANUALLY_REVIEWED_OFFICIAL_ANNOUNCEMENT',independentlyVerified:true,officialPublishedAt:null,exactRegularSeasonStartsAt:null,exactRegularSeasonEndsAt:null,postseasonEndsAt:null,automaticCollectorEnabled:false}));
const body={version:'reviewed-public-season-calendar-facts-1',artifactKind:'DERIVED_RESEARCH_FACTS_NOT_RAW_PROVIDER_RESPONSE',facts,reviewedFactsFingerprint:fingerprint(facts),developmentWrites:0,providerRawResponseFingerprint:null};
await mkdir('data/schedule_enrichment',{recursive:true});
await writeFile('data/schedule_enrichment/announced_season_calendar.json',JSON.stringify(body,null,2)+'\n');
const at=new Date().toISOString();
const observations=facts.map(row=>({provider:'reviewed-professional-calendar',sport:row.sport,entityKey:`season-date:${row.sport}:${row.seasonStartYear}`,revisionToken:fingerprint(row),revisionOrdinal:Date.parse(at),sourceReference:row.sourceReference,observedAt:at,effectiveAt:null,publishedAt:null,raw:{reviewedFacts:row,artifactKind:'DERIVED_RESEARCH_FACTS_NOT_RAW_PROVIDER_RESPONSE',rawProviderResponseFingerprint:null},normalized:seasonDateSnapshotSchema.parse({kind:'SEASON_DATE_SNAPSHOT',seasonStartYear:row.seasonStartYear,label:row.label,regularSeasonStartsOn:row.regularSeasonStartsOn,regularSeasonEndsOn:row.regularSeasonEndsOn,sourceZone:row.sourceZone,precision:'DAY',sourceRecordId:`${row.sport}:${row.seasonStartYear}:official-regular-season-announcement`,reviewedFactsFingerprint:fingerprint(row),proofKind:'REVIEWED_OFFICIAL_PUBLIC_CALENDAR_FACTS',independentlyVerified:true,firstObservedAt:at,policyAdoptedAt:observedPolicyAdoptedAt.toISOString(),validFrom:at,retracted:false,policyVersion:'approved-season-date-snapshot-1'})}));
const proposal={version:'reviewed-announced-season-date-promotion-1',observations,sourceRawResponseFingerprint:null,reviewedFactsFingerprint:body.reviewedFactsFingerprint,developmentWrites:0,approvalRequired:true};
await writeFile('data/schedule_enrichment/announced_season_calendar_promotion.json',JSON.stringify({...proposal,fingerprint:fingerprint(proposal)},null,2)+'\n');
console.log(JSON.stringify({factsFingerprint:body.reviewedFactsFingerprint,promotionFingerprint:fingerprint(proposal),observations:observations.length,developmentWrites:0},null,2));
