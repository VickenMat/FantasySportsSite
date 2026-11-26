import{randomUUID}from"node:crypto";
import{expect,test}from"@playwright/test";
import{getDatabase}from"../../src/lib/db";
import{createLeague}from"../../src/server/league";
import{persistObservation}from"../../src/ingestion/persist";
import{selectAndScoreSource}from"../../src/ingestion/source-selection";
import{statEntityKey}from"../../src/ingestion/statistics";
import type{Observation}from"../../src/ingestion/contracts";
import{applicableRules}from"../../src/scoring/engine";
import{ubpV9Rules}from"../../src/scoring/ubp-v9";
test("shows unknown, provisional and source-published data separately without treating publication as fantasy finalization",async({page})=>{
 const db=getDatabase(),owner=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}});
 const league=await createLeague(owner.id,{name:`Synthetic source browser ${randomUUID()}`,sports:["NBA"],historical:true,seasonYear:2047,maxTeams:2,fillWithComputers:true,competitionType:"CUMULATIVE"});
 try{
  await page.goto("/sign-in");await page.getByLabel("Email").fill(process.env.DEMO_EMAIL!);await page.getByLabel("Password",{exact:true}).fill(process.env.DEMO_PASSWORD!);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL("/dashboard");
  await page.goto(`/leagues/${league.id}/matchups?sport=NBA`);
  const panel=page.getByRole("region",{name:"NBA source data status"});await expect(panel).toContainText("Current source data is awaiting verification");
  const provider=`browser-source-${randomUUID()}`,at=new Date(Date.now()-5000),sport=await db.leagueSport.findFirstOrThrow({where:{leagueId:league.id,sport:"NBA"}});
  const player=await db.player.create({data:{sport:"NBA",displayName:"Explicit synthetic source athlete",isSynthetic:true}});await db.playerExternalId.create({data:{sport:"NBA",provider,externalId:"player",playerId:player.id}});
  const team=await db.proTeam.create({data:{sport:"NBA",provider,externalId:"team",displayName:"Explicit synthetic source team"}});
  const start=new Date(+at-120000),game=await db.game.create({data:{sport:"NBA",seasonId:sport.seasonId,provider,externalId:"game",phase:"REGULAR",startsAt:start}});await db.gameTeam.create({data:{gameId:game.id,teamId:team.id}});
  const base={provider,sport:"NBA" as const,revisionToken:"1",revisionOrdinal:1,sourceReference:"https://fixture.invalid/explicit-synthetic-box-score",observedAt:at.toISOString(),effectiveAt:null,publishedAt:null,raw:{synthetic:true}};
  const state:Observation={...base,entityKey:`game-state:${game.id}`,effectiveAt:start.toISOString(),publishedAt:new Date(+start+1000).toISOString(),normalized:{kind:"GAME_STATE",game:{provider,externalId:"game"},status:"LIVE",scheduledStartsAt:start.toISOString(),actualStartsAt:start.toISOString(),completedAt:null}};
  const zeros=Object.fromEntries(applicableRules(ubpV9Rules,"BASKETBALL").map(r=>[r.statKey,0]));
  const record:Observation={...base,entityKey:statEntityKey(game.id,player.id,"BASKETBALL"),normalized:{kind:"STAT",player:{provider,externalId:"player"},game:{provider,externalId:"game"},team:{provider,externalId:"team"},role:"BASKETBALL",phase:"LIVE",publicationSemantics:"UNVERIFIED",stats:{...zeros,PTS:10,REB:null}}};
  const selection={version:"explicit-browser-fixture",sources:[{provider,priority:0,maxAgeMs:3600000,allowProvisional:true,permission:"FIXTURE_ONLY" as const}]};
  await db.$transaction(async tx=>{await persistObservation(tx,state,at);await persistObservation(tx,record,at);});await selectAndScoreSource({sport:"NBA",gameId:game.id,playerId:player.id},selection,at);
  await page.reload();await expect(panel).toContainText("Provisional scoring data");await expect(panel).toContainText("Some required statistics are unknown");await expect(panel).toContainText("original final publication time is unknown");
  const originalPublication=new Date(+at-20000).toISOString();
  const finalState:Observation={...state,revisionToken:"2",revisionOrdinal:2,effectiveAt:new Date(+at-30000).toISOString(),publishedAt:originalPublication,normalized:{...state.normalized as Extract<Observation["normalized"],{kind:"GAME_STATE"}>,status:"FINAL",completedAt:new Date(+at-30000).toISOString()}};
  const official:Observation={...record,revisionToken:"2",revisionOrdinal:2,publishedAt:new Date(+at-10000).toISOString(),normalized:{...record.normalized as Extract<Observation["normalized"],{kind:"STAT"}>,phase:"CORRECTION",publicationSemantics:"OFFICIAL_BOX_SCORE",initialPublishedAt:originalPublication,stats:{...zeros,PTS:20,REB:5}}};
  await db.$transaction(async tx=>{await persistObservation(tx,finalState,at);await persistObservation(tx,official,at);});await selectAndScoreSource({sport:"NBA",gameId:game.id,playerId:player.id},selection,at);
  await page.reload();await expect(panel).toContainText("Official source publication recorded");await expect(panel).toContainText("Source publication does not finalize fantasy results");
  await expect(panel.getByText("Original final publication",{exact:true}).locator("..").locator("dd")).not.toHaveText("Unknown");await expect(panel.getByRole("link",{name:"Source",exact:true})).toHaveAttribute("href",base.sourceReference);
  expect(await db.sportCompetition.count({where:{leagueId:league.id,finalizedAt:{not:null}}})).toBe(0);expect(await db.scoreLedger.count({where:{playerId:player.id,gameId:game.id}})).toBe(1);
 }finally{await db.league.delete({where:{id:league.id}});await db.$disconnect();}
});
