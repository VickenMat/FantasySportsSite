import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { assertIsolatedIngestionDatabase } from '../../src/ingestion/persist';
import { getDatabase } from '../../src/lib/db';
import { formatScore } from '../../src/scoring/engine';

test('real-source scores render as finalized after the explicitly controlled fantasy clock',async({page})=>{
 test.skip(process.env.REAL_COMPETITIVE_ACCEPTANCE!=='true','Requires populated-copy real-source competition setup.');
 assertIsolatedIngestionDatabase();test.setTimeout(90000);
 const db=getDatabase(),email=`competitive-viewer-${randomUUID()}@example.test`;
 try{
  const proof=JSON.parse(await readFile('data/stat_enrichment/m5_real_competitive_stage_validation.json','utf8')) as {developmentWrites:number;websiteBrowserAcceptance?:unknown;results:{sport:string;leagueId:string;finalizedRealSource:string[];all15StagesDemonstrated:boolean;websitePresentation?:string}[]};
  expect(proof.developmentWrites).toBe(0);expect(proof.results).toHaveLength(3);
  await page.setExtraHTTPHeaders({'x-forwarded-for':'198.51.100.247'});
  await page.goto('/sign-up');
  await page.getByLabel('Name',{exact:true}).fill('Controlled real-source viewer');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill('isolated-competition-review-12!');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page).toHaveURL('/dashboard');
  const viewer=await db.user.findUniqueOrThrow({where:{email}});
  await db.leagueMember.createMany({data:proof.results.map(row=>({leagueId:row.leagueId,userId:viewer.id,role:'MANAGER' as const}))});
  for(const result of proof.results){
   const response=await page.goto(`/leagues/${result.leagueId}/matchups?sport=${result.sport}`);expect(response?.status()).toBe(200);
   await expect(page.getByRole('heading',{name:`${result.sport} matchups`,exact:true})).toBeVisible();
   const card=page.locator('article.matchup').first();await expect(card).toContainText('FINAL');
   await expect(card.locator('strong')).toHaveText(result.finalizedRealSource.map(value=>formatScore(BigInt(value))));
   await expect(page.getByText("This page couldn't load.",{exact:true})).toHaveCount(0);
   await page.goto(`/leagues/${result.leagueId}/standings?sport=${result.sport}`);
   await expect(page.locator('table tbody tr').first()).toBeVisible();
   const stored=await db.matchup.findFirstOrThrow({where:{leagueId:result.leagueId}});expect(stored.status).toBe('FINAL');expect([stored.homeTenths.toString(),stored.awayTenths.toString()]).toEqual(result.finalizedRealSource);
  }
  proof.websiteBrowserAcceptance={passed:true,sports:proof.results.map(row=>row.sport),scope:'Rendered real-source final matchup cards and standings; league chronology and elapsed24hours are controlled fixtures'};
  for(const row of proof.results){row.all15StagesDemonstrated=true;row.websitePresentation='CHROMIUM_RENDERED_FINAL_MATCHUPS_AND_STANDINGS';}
  await writeFile('data/stat_enrichment/m5_real_competitive_stage_validation.json',JSON.stringify(proof,null,2)+'\n');
 }finally{await db.user.deleteMany({where:{email}});await db.$disconnect();}
});

test('MLB supplemental real-source scores render after the explicitly controlled fantasy clock',async({page})=>{
 test.skip(process.env.REAL_MLB_COMPETITIVE_ACCEPTANCE!=='true','Requires separate populated-copy MLB real-source competition setup.');
 assertIsolatedIngestionDatabase();test.setTimeout(90000);
 const db=getDatabase(),email=`mlb-competitive-viewer-${randomUUID()}@example.test`;
 try{
  const proof=JSON.parse(await readFile('data/stat_enrichment/m5_real_mlb_competitive_validation.json','utf8')) as {developmentWrites:number;leagueId:string;finalizedRealSource:string[];all15StagesDemonstrated:boolean;websitePresentation:string;websiteBrowserAcceptance?:unknown;hypotheticalFantasyContext:string};
  expect(proof.developmentWrites).toBe(0);expect(proof.hypotheticalFantasyContext).toContain('isolated fixtures');
  await page.setExtraHTTPHeaders({'x-forwarded-for':'198.51.100.248'});
  await page.goto('/sign-up');await page.getByLabel('Name',{exact:true}).fill('Controlled MLB source viewer');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('isolated-mlb-competition-12!');await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL('/dashboard');
  const viewer=await db.user.findUniqueOrThrow({where:{email}});await db.leagueMember.create({data:{leagueId:proof.leagueId,userId:viewer.id,role:'MANAGER'}});
  const response=await page.goto(`/leagues/${proof.leagueId}/matchups?sport=MLB`);expect(response?.status()).toBe(200);await expect(page.getByRole('heading',{name:'MLB matchups',exact:true})).toBeVisible();
  const card=page.locator('article.matchup').first();await expect(card).toContainText('FINAL');await expect(card.locator('strong')).toHaveText(proof.finalizedRealSource.map(value=>formatScore(BigInt(value))));await expect(page.getByText("This page couldn't load.",{exact:true})).toHaveCount(0);
  await page.goto(`/leagues/${proof.leagueId}/standings?sport=MLB`);await expect(page.locator('table tbody tr').first()).toBeVisible();
  const stored=await db.matchup.findFirstOrThrow({where:{leagueId:proof.leagueId}});expect(stored.status).toBe('FINAL');expect([stored.homeTenths.toString(),stored.awayTenths.toString()]).toEqual(proof.finalizedRealSource);
  proof.websiteBrowserAcceptance={passed:true,sport:'MLB',scope:'Rendered accepted historical V9 scores with independent licensed final/role evidence; fantasy prelock ownership, threshold eligibility, availability and elapsed24hours are controlled fixtures'};proof.all15StagesDemonstrated=true;proof.websitePresentation='CHROMIUM_RENDERED_FINAL_MATCHUPS_AND_STANDINGS';await writeFile('data/stat_enrichment/m5_real_mlb_competitive_validation.json',JSON.stringify(proof,null,2)+'\n');
 }finally{await db.user.deleteMany({where:{email}});await db.$disconnect();}
});
