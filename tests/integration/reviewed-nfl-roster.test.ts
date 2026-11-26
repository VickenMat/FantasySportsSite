import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { fingerprint } from '@/ingestion/contracts';
import { buildReviewedNflRosterManifest, reconcileReviewedNflRoster } from '@/server/reviewed-nfl-roster';

const db=getDatabase();afterAll(()=>db.$disconnect());
it('reviews non-fantasy NFL professionals and explicit GSIS/ESPN links without inventing slot eligibility or crossing sports',async()=>{
 const reviewer=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}});
 const existing=await db.player.create({data:{sport:'NFL',displayName:`Isolated existing NFL identity fixture ${randomUUID()}`,isSynthetic:false,isDemo:false}});
 const nba=await db.player.create({data:{sport:'NBA',displayName:`Isolated separate-sport identity fixture ${randomUUID()}`,isSynthetic:true}});
 const oldGsis=`00-${randomInt(1000000,4000000)}`,newGsis=`00-${randomInt(4000001,9000000)}`,oldEspn=String(randomInt(1000000,4000000)),newEspn=String(randomInt(4000001,9000000)),newId=randomUUID();
 await db.playerExternalId.createMany({data:[{sport:'NFL',provider:'v9-historical',externalId:oldGsis,playerId:existing.id},{sport:'NBA',provider:'espn',externalId:oldEspn,playerId:nba.id}]});
 const manifest=buildReviewedNflRosterManifest({candidates:[{sourcePlayerId:newGsis,proposedPlayerId:newId,displayName:`Isolated reviewed offensive line fixture ${randomUUID()}`,birthDate:'2000-01-01',sourceTeamId:'KC',sourceObservedPosition:'OL'}],bridges:[{gsisId:oldGsis,espnAthleteId:oldEspn,playerId:existing.id,birthDate:null,basis:'EXPLICIT_SAME_ROW_GSIS_ESPN',sourceRows:[2]},{gsisId:newGsis,espnAthleteId:newEspn,playerId:newId,birthDate:'2000-01-01',basis:'EXPLICIT_SAME_ROW_GSIS_ESPN',sourceRows:[3]}]},[{sourceReference:'https://fixture.invalid/explicit-gsis-espn-roster',sha256:fingerprint({synthetic:true,id:newId})}],reviewer.id);
 const dry=await reconcileReviewedNflRoster(manifest);expect(dry).toMatchObject({newPlayers:1,newAliases:3,applied:false});
 expect(await db.player.findUnique({where:{id:newId}})).toBeNull();
 expect(await reconcileReviewedNflRoster(manifest,{expectedFingerprint:dry.fingerprint})).toMatchObject({newPlayers:1,newAliases:3,applied:true});
 expect(await db.player.findUniqueOrThrow({where:{id:newId}})).toMatchObject({sport:'NFL',isSynthetic:false,isDemo:false});
 expect(await db.playerExternalId.findUniqueOrThrow({where:{sport_provider_externalId:{sport:'NFL',provider:'espn',externalId:oldEspn}}})).toMatchObject({playerId:existing.id});
 expect(await db.playerExternalId.findUniqueOrThrow({where:{sport_provider_externalId:{sport:'NBA',provider:'espn',externalId:oldEspn}}})).toMatchObject({playerId:nba.id});
 expect(await db.playerPositionEvidence.count({where:{playerId:newId}})).toBe(0);expect(await db.playerGameStat.count({where:{playerId:newId}})).toBe(0);
 expect(await reconcileReviewedNflRoster(manifest,{expectedFingerprint:dry.fingerprint})).toMatchObject({newPlayers:0,newAliases:0,alreadyApplied:true});
 const receipt=await db.professionalDataObservation.findFirstOrThrow({where:{provider:'reviewed-nfl-roster',contentHash:dry.fingerprint}});
 expect(receipt).toMatchObject({effectiveAt:null,publishedAt:null,raw:{manifest:{candidates:[{sourceObservedPosition:'OL'}]}}});
});

it('preserves distinct same-name professionals only with reviewed different GSIS and birth-date evidence',async()=>{
 const reviewer=await db.user.findUniqueOrThrow({where:{email:process.env.DEMO_EMAIL}}),name=`Isolated NFL namesake fixture ${randomUUID()}`;
 const old=await db.player.create({data:{sport:'NFL',displayName:name,isSynthetic:false,isDemo:false}}),oldGsis=`00-${randomInt(1000000,4000000)}`,newGsis=`00-${randomInt(4000001,9000000)}`,newId=randomUUID();
 await db.playerExternalId.create({data:{sport:'NFL',provider:'v9-historical',externalId:oldGsis,playerId:old.id}});
 const manifest=buildReviewedNflRosterManifest({candidates:[{sourcePlayerId:newGsis,proposedPlayerId:newId,displayName:name,birthDate:'2002-04-03',sourceTeamId:'IND',sourceObservedPosition:'DB',distinctNameProofs:[{otherCanonicalPlayerId:old.id,otherGsisId:oldGsis,otherBirthDate:'1997-10-14',basis:'DISTINCT_GSIS_AND_BIRTH_DATE',sourceRows:[2,3]}]}],bridges:[]},[{sourceReference:'https://fixture.invalid/distinct-nfl-identifiers-and-dob',sha256:fingerprint({synthetic:true,newId})}],reviewer.id);
 const noProof={...manifest,candidates:[{...manifest.candidates[0],distinctNameProofs:[]}]};await expect(reconcileReviewedNflRoster(noProof)).rejects.toThrow(/lacks independent/);
 const sameDate={...manifest,candidates:[{...manifest.candidates[0],distinctNameProofs:[{...manifest.candidates[0].distinctNameProofs[0],otherBirthDate:'2002-04-03'}]}]};await expect(reconcileReviewedNflRoster(sameDate)).rejects.toThrow(/Different namespaced IDs and birth dates/);
 const before=await db.player.findUniqueOrThrow({where:{id:old.id}}),dry=await reconcileReviewedNflRoster(manifest);
 expect(await reconcileReviewedNflRoster(manifest,{expectedFingerprint:dry.fingerprint})).toMatchObject({newPlayers:1,newAliases:1});
 expect(await db.player.findUniqueOrThrow({where:{id:old.id}})).toEqual(before);expect(await db.player.count({where:{sport:'NFL',displayName:name}})).toBe(2);
 expect((await db.playerExternalId.findUniqueOrThrow({where:{sport_provider_externalId:{sport:'NFL',provider:'v9-historical',externalId:newGsis}}})).playerId).toBe(newId);
});
