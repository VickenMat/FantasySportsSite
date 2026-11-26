import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { buildReviewedNbaRosterManifest, reconcileReviewedRoster } from '@/server/reviewed-roster-discovery';

const db=getDatabase();afterAll(()=>db.$disconnect());
async function fixture(){
 const reviewer=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}});
 const existing=await db.player.create({data:{sport:'NBA',displayName:`Isolated existing real-source identity fixture ${randomUUID()}`,isSynthetic:false,isDemo:false}});
 const existingSourceId=String(randomInt(100000000,400000000)),newSourceId=String(randomInt(400000001,800000000)),espnExisting=String(randomInt(100000000,400000000)),espnNew=String(randomInt(400000001,800000000)),newId=randomUUID();
 await db.playerExternalId.create({data:{sport:'NBA',provider:'v9-historical',externalId:existingSourceId,playerId:existing.id}});
 const candidateReport={rows:[{sourcePlayerId:newSourceId,proposedPlayerId:newId,displayName:`Isolated reviewed real-source discovery fixture ${randomUUID()}`,birthDate:'2000-01-01',sourceTeamId:'1610612737',sourceObservedPosition:'G',status:'NEW_DIRECT_NBA_ID_REQUIRES_APPROVAL',nameCollisionIds:[],existingCanonicalPlayerId:null}]};
 const bridgeReport={rows:[{nbaPlayerId:existingSourceId,espnAthleteId:espnExisting,status:'VERIFIED_DOB_CURRENT_TEAM',canonicalPlayerId:existing.id,officialBirthDates:['2000-01-01'],espnBirthDates:['2000-01-01']},{nbaPlayerId:newSourceId,espnAthleteId:espnNew,status:'VERIFIED_HISTORICAL_DOB_CURRENT_ESPN_PROFILE',canonicalPlayerId:null,officialBirthDates:['2000-01-01'],espnBirthDates:['2000-01-01']}]};
 const manifest=buildReviewedNbaRosterManifest(candidateReport,bridgeReport,[{sourceReference:'https://fixture.invalid/reviewed-direct-ids-and-dob',sha256:fingerprint({syntheticFixture:randomUUID()})}],reviewer.id);
 return{manifest,newId,existing,espnExisting};
}

it('creates real identities only through exact reviewed roster targets, preserving old records, unknown positions and publication',async()=>{
 const f=await fixture(),beforePlayers=await db.player.count(),beforeAliases=await db.playerExternalId.count(),beforeStats=await db.playerGameStat.count(),beforeScores=await db.scoreLedgerEntry.count();
 const existingBefore=await db.player.findUniqueOrThrow({where:{id:f.existing.id}});
 const dry=await reconcileReviewedRoster(f.manifest);
 expect(dry).toMatchObject({newPlayers:1,newAliases:3,applied:false});
 expect(await db.player.count()).toBe(beforePlayers);
 await expect(reconcileReviewedRoster(f.manifest,{expectedFingerprint:'0'.repeat(64)})).rejects.toThrow(/changed/);
 const applied=await reconcileReviewedRoster(f.manifest,{expectedFingerprint:dry.fingerprint});
 expect(applied).toMatchObject({newPlayers:1,newAliases:3,applied:true});
 expect(await db.player.findUniqueOrThrow({where:{id:f.newId}})).toMatchObject({isSynthetic:false,isDemo:false});
 expect(await db.player.findUniqueOrThrow({where:{id:f.existing.id}})).toEqual(existingBefore);
 expect(await db.player.count()).toBe(beforePlayers+1);expect(await db.playerExternalId.count()).toBe(beforeAliases+3);
 expect(await db.playerPositionEvidence.count({where:{playerId:f.newId}})).toBe(0);
 expect(await db.playerGameStat.count()).toBe(beforeStats);expect(await db.scoreLedgerEntry.count()).toBe(beforeScores);
 expect(await reconcileReviewedRoster(f.manifest,{expectedFingerprint:dry.fingerprint})).toMatchObject({newPlayers:0,newAliases:0,alreadyApplied:true,applied:false});
 const receipt=await db.professionalDataObservation.findFirstOrThrow({where:{category:'REVIEWED_ROSTER_DISCOVERY',contentHash:dry.fingerprint},include:{decisions:true}});
 expect(receipt).toMatchObject({publishedAt:null,effectiveAt:null,normalized:{eligibilityPositionsGranted:[]},raw:{manifest:{reviewerUserId:f.manifest.reviewerUserId}}});
 await expect(db.professionalDataDecision.delete({where:{id:receipt.decisions[0].id}})).rejects.toThrow(/append-only/);
});

it('rejects changed identity heads and conflicting canonical names without partially creating players or aliases',async()=>{
 const f=await fixture(),dry=await reconcileReviewedRoster(f.manifest),before=await db.player.count();
 await db.playerExternalId.create({data:{sport:'NBA',provider:'espn',externalId:f.espnExisting,playerId:f.existing.id}});
 await expect(reconcileReviewedRoster(f.manifest,{expectedFingerprint:dry.fingerprint})).rejects.toThrow(/edge\/head changed/);
 expect(await db.player.findUnique({where:{id:f.newId}})).toBeNull();expect(await db.player.count()).toBe(before);
 const other=await fixture();await db.player.create({data:{sport:'NBA',displayName:other.manifest.candidates[0].displayName,isSynthetic:true}});
 await expect(reconcileReviewedRoster(other.manifest)).rejects.toThrow(/name conflicts/);
 expect(await db.player.findUnique({where:{id:other.newId}})).toBeNull();
 const invalid={...other.manifest,bridges:[{...other.manifest.bridges[0],basis:'exact_name'}]};
 await expect(reconcileReviewedRoster(invalid)).rejects.toThrow();
});

it('collapses identical bridge evidence with all source rows retained and rejects conflicting duplicate aliases',async()=>{
 const f=await fixture(),row=f.manifest.bridges[0];
 const bridge={nbaPlayerId:row.nbaPlayerId,espnAthleteId:row.espnAthleteId,status:row.basis,canonicalPlayerId:row.playerId,officialBirthDates:[row.birthDate],espnBirthDates:[row.birthDate]};
 const clean=buildReviewedNbaRosterManifest({rows:[]},{rows:[bridge,bridge]},f.manifest.sourceProofs,f.manifest.reviewerUserId);
 expect(clean.bridges).toHaveLength(1);expect(clean.bridges[0].sourceRows).toEqual([1,2]);expect(clean.expectedAliasHeads).toHaveLength(1);
 expect(()=>buildReviewedNbaRosterManifest({rows:[]},{rows:[bridge,{...bridge,nbaPlayerId:'999999999',canonicalPlayerId:randomUUID()}]},f.manifest.sourceProofs,f.manifest.reviewerUserId)).toThrow(/Conflicting provider alias/);
});
