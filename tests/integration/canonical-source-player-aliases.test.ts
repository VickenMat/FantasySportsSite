import 'dotenv/config';
import {randomUUID,randomInt} from 'node:crypto';
import {it,expect,afterAll} from 'vitest';
import {getDatabase} from '@/lib/db';
import {canonicalSourcePlayerAliases} from '@/ingestion/open-data/canonical-player-aliases';
import {identityResolutionSchema} from '@/ingestion/identity-resolutions';
import {fingerprint} from '@/ingestion/contracts';
const db=getDatabase();afterAll(()=>db.$disconnect());
it('batch source collection applies reviewed reassignment/retraction as-of without rewriting or falling back to legacy aliases',async()=>{
 const rollback=new Error('Rollback only explicitly synthetic canonical-alias fixtures.');
 try{await db.$transaction(async tx=>{
  const a=await tx.player.create({data:{sport:'NFL',displayName:`Synthetic canonical A ${randomUUID()}`,isSynthetic:false,isDemo:false}}),b=await tx.player.create({data:{sport:'NFL',displayName:`Synthetic canonical B ${randomUUID()}`,isSynthetic:false,isDemo:false}}),externalId=`00-${randomInt(1000000,9999999)}`;
  const alias=await tx.playerExternalId.create({data:{sport:'NFL',provider:'v9-historical',externalId,playerId:a.id}}),at=new Date('2026-12-05T10:00:00Z');
  const current=async(when:Date)=>(await canonicalSourcePlayerAliases(tx,['NFL'],when)).find(row=>row.externalId===externalId)?.playerId??null;
  expect(await current(at)).toBe(a.id);
  const proposal=identityResolutionSchema.parse({version:'identity-review-1',sport:'NFL',reference:{provider:'v9-historical',externalId},expectedPlayerId:a.id,expectedResolutionId:null,replacementPlayerId:b.id,reviewerUserId:randomUUID(),reason:'Explicit isolated reviewed alias reassignment fixture.',sourceProofs:[{sourceReference:'https://fixture.invalid/explicit-identity',sha256:'a'.repeat(64),basis:'EXPLICIT_PROVIDER_ID',notes:'Synthetic explicit source-ID evidence, never a name merge.'}]}),hash=fingerprint(proposal);
  const observation=await tx.professionalDataObservation.create({data:{provider:'internal-identity-review',sport:'NFL',category:'IDENTITY_RESOLUTION',entityKey:`identity-resolution:${fingerprint({sport:'NFL',...proposal.reference})}`,revisionToken:hash,revisionOrdinal:1n,contentHash:hash,sourceReference:proposal.sourceProofs[0].sourceReference,observedAt:new Date(+at+1000),effectiveAt:new Date(+at+1000),raw:{proposal},normalized:{kind:'IDENTITY_RESOLUTION'},decisions:{create:{version:1,outcome:'ACCEPTED',reason:proposal.reason,targets:{playerId:b.id},decidedAt:new Date(+at+1000)}}}});
  expect(await current(at)).toBe(a.id);expect(await current(new Date(+at+1000))).toBe(b.id);
  const retraction={...proposal,expectedPlayerId:b.id,expectedResolutionId:observation.id,replacementPlayerId:null},retractHash=fingerprint(retraction);
  await tx.professionalDataObservation.create({data:{provider:'internal-identity-review',sport:'NFL',category:'IDENTITY_RESOLUTION',entityKey:observation.entityKey,revisionToken:retractHash,revisionOrdinal:2n,contentHash:retractHash,sourceReference:proposal.sourceProofs[0].sourceReference,observedAt:new Date(+at+2000),effectiveAt:new Date(+at+2000),raw:{proposal:retraction},normalized:{kind:'IDENTITY_RESOLUTION'},decisions:{create:{version:1,outcome:'ACCEPTED',reason:proposal.reason,targets:{playerId:null},decidedAt:new Date(+at+2000)}}}});
  expect(await current(new Date(+at+2000))).toBeNull();expect(await current(new Date(+at+1000))).toBe(b.id);expect((await tx.playerExternalId.findUniqueOrThrow({where:{id:alias.id}})).playerId).toBe(a.id);
  throw rollback;
 },{timeout:60000});}catch(error){if(error!==rollback)throw error;}
});
