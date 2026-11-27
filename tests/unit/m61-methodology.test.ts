import {describe,it,expect} from 'vitest';
import {campaignSeed,seedGroups,protectHoldout} from '@/simulation/methodology/seeds';
import {fixedAppearanceBounds} from '@/simulation/methodology/uncertainty';
describe('approved M6 methodology',()=>{
 it('preregisters sixty seeds and balances every group without outcome inputs',()=>{
  expect(Object.values(seedGroups).flat()).toHaveLength(60);
  for(const seeds of Object.values(seedGroups))for(const sport of ['NFL','MLB','NBA','NHL'])expect(seeds.filter(seed=>campaignSeed(seed).sharedBenchAllocation[sport]===2)).toHaveLength(5);
  expect(campaignSeed(11)).toEqual(campaignSeed(11));expect(new Set(campaignSeed(11).draftOrder).size).toBe(12);
 });
 it('protects both exposed-season holdout designation and reserved seeds',()=>{
  expect(()=>protectHoldout(2025,11)).toThrow('sealed');expect(()=>protectHoldout(2023,51)).toThrow('sealed');expect(()=>protectHoldout(2023,31)).not.toThrow();
 });
 it('bounds unknown SO through production scoring without modifying the source',()=>{
  const stats={goalie_win:1,saves:30,goalsAgainst:0,shutout:null};const before=JSON.stringify(stats);const bounds=fixedAppearanceBounds('GOALIE',stats);
  expect(bounds).toMatchObject({lowerTenths:610,upperTenths:797,bounded:true});expect(JSON.stringify(stats)).toBe(before);
 });
 it('does not claim a finite missing faceoff or adaptive strategy bound',()=>{
  expect(fixedAppearanceBounds('SKATER',{goals:0,assists:0,sog:0,blockedShots:0,hits:0,faceoff_wins:null,shorthanded_points_bonus:0}).bounded).toBe(false);
 });
});

describe('historical cohort acceptance',()=>{
 it('does not let an approved policy substitute for accepted cohorts',async()=>{
  const {requireAcceptedCycle}=await import('@/simulation/methodology/acceptance');
  expect(()=>requireAcceptedCycle({version:'m61-reviewed-comparable-cycles-1',methodologyFingerprint:'approved',scoringFingerprint:'wrong',cycles:[],fingerprint:'unverified'},2023,'approved')).toThrow('fingerprint');
 });
});
