import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { createLeague } from '@/server/league';
import { fingerprint } from '@/ingestion/contracts';
import type { Observation } from '@/ingestion/contracts';
import { persistObservation } from '@/ingestion/persist';
import { professionalPlayerIdentityState, resolveProfessionalPlayer, reviewProfessionalIdentityResolution, type IdentityResolutionProposal } from '@/ingestion/identity-resolutions';

const db = getDatabase();
afterAll(() => db.$disconnect());
const at = new Date('2046-01-01T12:00:00Z');
async function fixture() {
  const reviewer = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const sport = 'NBA' as const;
  const league=await createLeague(reviewer.id,{name:`Identity review fixture ${randomUUID()}`,sports:[sport],historical:true,seasonYear:2046,maxTeams:2,fillWithComputers:true});
  const roster=await db.fantasyRoster.findFirstOrThrow({where:{leagueId:league.id,sport,team:{managerId:reviewer.id}},include:{leagueSport:true}});
  const original=await db.player.create({data:{sport,displayName:`Synthetic original identity ${randomUUID()}`,isSynthetic:true}});
  const owned=await db.rosterEntry.create({data:{leagueId:league.id,teamId:roster.teamId,rosterId:roster.id,seasonId:roster.leagueSport.seasonId,sport,playerId:original.id,slot:'BENCH',slotIndex:1}});
  const replacement = await db.player.create({ data: { sport, displayName: `Synthetic reviewed identity ${randomUUID()}`, isSynthetic: true } });
  const reference = { provider: `identity-review-${randomUUID()}`, externalId: 'source-player' };
  const legacy = await db.playerExternalId.create({ data: { sport, ...reference, playerId: owned.playerId } });
  const proposal: IdentityResolutionProposal = { version: 'identity-review-1', sport, reference, expectedPlayerId: owned.playerId, expectedResolutionId: null, replacementPlayerId: replacement.id, reviewerUserId: reviewer.id, reason: 'Synthetic explicit-identifier correction review', sourceProofs: [{ sourceReference: 'https://fixture.invalid/explicit-player-identifiers', sha256: fingerprint({ fixture: reference.provider }), basis: 'EXPLICIT_PROVIDER_ID', notes: 'Isolated synthetic identity-resolution evidence; no real provider acceptance claim.' }] };
  return { owned, replacement, legacy, reference, proposal, sport };
}

it('audits reviewed correction, retraction and restoration without rewriting legacy edges, ownership or prior knowledge', async () => {
  const f = await fixture(), originalRoster = await db.rosterEntry.findUniqueOrThrow({ where: { id: f.owned.id } });
  const statsBefore = await db.playerGameStat.count(), entriesBefore = await db.scoreLedgerEntry.count();
  const dry = await reviewProfessionalIdentityResolution(f.proposal, undefined, at);
  expect(dry).toMatchObject({ status: 'REVIEW_REQUIRED', applied: false });
  await expect(reviewProfessionalIdentityResolution(f.proposal, { expectedFingerprint: '0'.repeat(64) }, at)).rejects.toThrow(/changed since review/);
  const applied = await reviewProfessionalIdentityResolution(f.proposal, { expectedFingerprint: dry.fingerprint }, at);
  expect(applied).toMatchObject({ status: 'APPLIED', applied: true, current: { mapping: { playerId: f.replacement.id } } });
  expect(await resolveProfessionalPlayer(db, f.sport, f.reference, new Date(+at - 1))).toMatchObject({ playerId: f.owned.playerId, source: 'LEGACY' });
  expect(await resolveProfessionalPlayer(db, f.sport, f.reference, at)).toMatchObject({ playerId: f.replacement.id, source: 'REVIEWED_OVERLAY' });
  expect(await db.playerExternalId.findUniqueOrThrow({ where: { id: f.legacy.id } })).toEqual(f.legacy);
  expect(await db.rosterEntry.findUniqueOrThrow({ where: { id: f.owned.id } })).toEqual(originalRoster);
  const retract = { ...f.proposal, expectedPlayerId: f.replacement.id, expectedResolutionId: applied.observationId, replacementPlayerId: null, reason: 'Synthetic source bridge withdrawn after explicit review' };
  const retractDry = await reviewProfessionalIdentityResolution(retract, undefined, new Date(+at + 1000));
  const retracted = await reviewProfessionalIdentityResolution(retract, { expectedFingerprint: retractDry.fingerprint }, new Date(+at + 1000));
  expect(await resolveProfessionalPlayer(db, f.sport, f.reference, new Date(+at + 1000))).toBeNull();
  expect(await professionalPlayerIdentityState(db, f.sport, f.reference, new Date(+at + 1000))).toMatchObject({ status: 'RETRACTED', resolutionId: retracted.observationId });
  const record=(observedAt:Date,revisionToken:string,discovery:'EXISTING'|'NEW'):Observation=>({provider:f.reference.provider,sport:f.sport,entityKey:'player:source-player',revisionToken,revisionOrdinal:Number(revisionToken),sourceReference:'https://fixture.invalid/identity-source',observedAt:observedAt.toISOString(),effectiveAt:null,publishedAt:null,raw:{synthetic:true},normalized:{kind:'PLAYER',externalId:f.reference.externalId,displayName:'Synthetic provider identity',links:[],discovery}});
  const blocked=await db.$transaction(tx=>persistObservation(tx,record(new Date(+at+1500),'2','NEW'),new Date(+at+1500)));
  expect(blocked.outcome).toBe('QUARANTINED');
  const earlier=await db.$transaction(tx=>persistObservation(tx,record(new Date(+at-1),'1','EXISTING'),new Date(+at+1800)));
  expect(earlier).toMatchObject({outcome:'ACCEPTED',targets:{playerId:f.owned.playerId}});
  expect(await reviewProfessionalIdentityResolution(f.proposal, { expectedFingerprint: dry.fingerprint }, new Date(+at + 2000))).toMatchObject({ status: 'ALREADY_APPLIED', applied: false, current: { status: 'RETRACTED' } });
  const restore = { ...f.proposal, expectedPlayerId: null, expectedResolutionId: retracted.observationId, reason: 'Synthetic independent review restores the explicit bridge' };
  const restored = await reviewProfessionalIdentityResolution(restore, { expectedFingerprint: fingerprint(restore) }, new Date(+at + 3000));
  expect(restored.current.mapping?.playerId).toBe(f.replacement.id);
  const corrected=await db.$transaction(tx=>persistObservation(tx,record(new Date(+at+3500),'3','EXISTING'),new Date(+at+3500)));
  expect(corrected).toMatchObject({outcome:'ACCEPTED',targets:{playerId:f.replacement.id}});
  await expect(reviewProfessionalIdentityResolution({ ...f.proposal, reason: 'Different stale proposal must not overwrite a later review' }, undefined, new Date(+at + 4000))).rejects.toThrow(/changed since review/);
  await expect(reviewProfessionalIdentityResolution({ ...f.proposal, reason: 'An attempted backdated review is rejected explicitly' }, undefined, new Date(+at - 1000))).rejects.toThrow(/cannot be backdated/);
  const review = await db.professionalDataObservation.findUniqueOrThrow({ where: { id: restored.observationId! }, include: { decisions: true } });
  expect(review).toMatchObject({ publishedAt: null, effectiveAt: new Date(+at + 3000), raw: { proposal: { reviewerUserId: f.proposal.reviewerUserId } } });
  await expect(db.professionalDataObservation.update({ where: { id: review.id }, data: { raw: { altered: true } } })).rejects.toThrow(/append-only/);
  await expect(db.professionalDataDecision.delete({ where: { id: review.decisions[0].id } })).rejects.toThrow(/append-only/);
  expect(await db.playerGameStat.count()).toBe(statsBefore);
  expect(await db.scoreLedgerEntry.count()).toBe(entriesBefore);
});

it('fails closed on malformed overlays and requires a valid same-sport canonical replacement and review head', async () => {
  const f = await fixture();
  const wrongSport = await db.player.create({ data: { sport: 'NFL', displayName: `Synthetic wrong sport ${randomUUID()}`, isSynthetic: true } });
  await expect(reviewProfessionalIdentityResolution({ ...f.proposal, replacementPlayerId: wrongSport.id }, undefined, at)).rejects.toThrow(/same sport/);
  await expect(reviewProfessionalIdentityResolution({ ...f.proposal, reviewerUserId: randomUUID() }, undefined, at)).rejects.toThrow(/reviewer identity/);
  await expect(reviewProfessionalIdentityResolution({ ...f.proposal, expectedResolutionId: randomUUID() }, undefined, at)).rejects.toThrow(/changed since review/);
  const malformed = await db.professionalDataObservation.create({ data: { provider: 'internal-identity-review', sport: f.sport, category: 'IDENTITY_RESOLUTION', entityKey: `identity-resolution:${fingerprint({ sport: f.sport, ...f.reference })}`, revisionToken: 'malformed', revisionOrdinal: 1n, contentHash: '0'.repeat(64), sourceReference: 'https://fixture.invalid/malformed-identity', observedAt: at, effectiveAt: at, publishedAt: null, raw: {}, normalized: {} } });
  await db.professionalDataDecision.create({ data: { observationId: malformed.id, version: 1, outcome: 'ACCEPTED', reason: 'Isolated corrupt legacy fixture must fail closed', targets: { playerId: f.owned.playerId }, decidedAt: at } });
  expect(await professionalPlayerIdentityState(db, f.sport, f.reference, at)).toMatchObject({ status: 'CONFLICT', mapping: null });
  expect(await resolveProfessionalPlayer(db, f.sport, f.reference, at)).toBeNull();
  await expect(reviewProfessionalIdentityResolution(f.proposal, undefined, at)).rejects.toThrow(/Conflicting identity evidence/);
});
