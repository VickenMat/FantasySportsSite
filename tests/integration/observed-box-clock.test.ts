import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDatabase } from '@/lib/db';
import { persistObservation } from '@/ingestion/persist';
import { statEntityKey } from '@/ingestion/statistics';
import { selectAndScoreSource } from '@/ingestion/source-selection';
import { applicableRules } from '@/scoring/engine';
import { ubpV9Rules } from '@/scoring/ubp-v9';
import { completeFinalBoxSchema } from '@/scoring/complete-box-policy';
import { correctionAnchor, invalidateCorrectionAnchor, statisticalDeadline } from '@/server/publication-anchors';
import { createLeague } from '@/server/league';
import { captureGameLineups, recordAvailabilityEvidence, pendingGameStarterSnapshots } from '@/server/lineup-snapshots';
import { recordPositionEvidence } from '@/server/positions';
import { periodPublicationTime, scoreCapturedStarters } from '@/server/competition-scoring';
import { professionalDataFreshness } from '@/server/professional-data-freshness';
import type { Observation } from '@/ingestion/contracts';
const db = getDatabase(), ownedLeagueIds = new Set<string>();
afterAll(async () => {
  try { if (ownedLeagueIds.size) await db.league.deleteMany({ where: { id: { in: [...ownedLeagueIds] } } }); }
  finally { await db.$disconnect(); }
});
const instant = (hour: number, minute = 0) => new Date(Date.UTC(2043,0,2,hour,minute));
async function fixture(partial = false, year = 2043) {
  const provider = `box-clock-${randomUUID()}`, canonical = `canonical-${randomUUID()}`;
  const season = await db.season.upsert({ where: { sport_startYear: { sport: 'NBA', startYear: year } }, create: { sport: 'NBA', startYear: year, label: `${year}–${year+1}` }, update: {} });
  const team = await db.proTeam.create({ data: { sport: 'NBA', provider: canonical, externalId: 'team', displayName: 'Synthetic box team' } });
  const game = await db.game.create({ data: { sport: 'NBA', provider: canonical, externalId: randomUUID(), seasonId: season.id, phase: 'REGULAR', startsAt: instant(10) } });
  await db.gameTeam.create({ data: { gameId: game.id, teamId: team.id } });
  const player = await db.player.create({ data: { sport: 'NBA', displayName: `Synthetic clock ${randomUUID()}`, isSynthetic: true } });
  await db.playerExternalId.create({ data: { sport: 'NBA', playerId: player.id, provider: canonical, externalId: 'athlete' } });
  const zeros = Object.fromEntries(applicableRules(ubpV9Rules,'BASKETBALL').map(rule => [rule.statKey,0]));
  const base = { provider, sport: 'NBA' as const, sourceReference: 'https://fixture.invalid/complete-box-clock', observedAt: instant(17).toISOString(), effectiveAt: null, publishedAt: null, revisionToken: '1', revisionOrdinal: 1, raw: { synthetic: true } };
  const apply = (value: Observation) => db.$transaction(tx => persistObservation(tx,value,new Date(value.observedAt)));
  const state: Observation = { ...base, entityKey: `game-state:${game.id}`, observedAt: instant(14).toISOString(), normalized: { kind: 'GAME_STATE', evidencePolicy: 'CONSERVATIVE_OBSERVED_V1', game: { provider: canonical, externalId: game.externalId }, status: 'FINAL', scheduledStartsAt: game.startsAt!.toISOString(), actualStartsAt: null, completedAt: null } };
  expect((await apply(state)).outcome).toBe('ACCEPTED');
  const stat: Observation = { ...base, entityKey: statEntityKey(game.id,player.id,'BASKETBALL'), normalized: { kind: 'STAT', player: { provider: canonical, externalId: 'athlete' }, game: { provider: canonical, externalId: game.externalId }, team: { provider: canonical, externalId: 'team' }, role: 'BASKETBALL', phase: 'FINAL', publicationSemantics: 'UNVERIFIED', stats: { ...zeros, PTS: 10, ...(partial ? { REB: null } : {}) } } };
  const policy = { version: 'synthetic-observed-clock', sources: [{ provider, priority: 0, maxAgeMs: 86400000, allowProvisional: true, permission: 'FIXTURE_ONLY' as const }] };
  const score = async (at: Date) => {
    const result = await selectAndScoreSource({ sport: 'NBA', gameId: game.id, playerId: player.id, role: 'BASKETBALL' },policy,at);
    if (result.status !== 'SCORED') throw Error(`Expected synthetic score, received ${result.status}`);
    return result.entry;
  };
  expect((await apply(stat)).outcome).toBe('ACCEPTED');
  const firstScore = await score(instant(17));
  const withHash = async (entry: typeof firstScore, at: Date, revision = 1) => {
    const source = await db.playerGameStat.findUniqueOrThrow({ where: { id: entry.statId } });
    const value = boxWithHash(entry,source.contentHash,at,revision); return value;
  };
  // Build only validated reviewed row hashes; an empty placeholder cannot reach ingestion.
  const boxWithHash = (entry: typeof firstScore, hash: string, at: Date, revision: number): Observation => ({ ...base, observedAt: at.toISOString(), entityKey: `complete-box:${game.id}`, revisionToken: String(revision), revisionOrdinal: revision,
    normalized: completeFinalBoxSchema.parse({ kind: 'COMPLETE_FINAL_BOX', game: { provider: canonical, externalId: game.externalId }, policyVersion: 'CONSERVATIVE_OBSERVED_V1', sourceFingerprint: 'a'.repeat(64), completeness: { allExpectedRowsPresent: true, rolesResolved: true, noUnresolvedContradictions: true, expectedPlayers: 1 }, statistics: [{ playerId: player.id, role: 'BASKETBALL', statId: entry.statId, statHash: hash, scoreEntryId: entry.id }], publicationSemantics: 'OBSERVED_COMPLETE_BOX', initialPublishedAt: null }) });
  return { provider, canonical, game, player, stat, zeros, firstScore, score, apply, box: withHash, anchor: (at: Date) => db.$transaction(tx => correctionAnchor(tx,game.id,at)) };
}
it('starts only at the first complete validated box and preserves one shared deadline through replay, corrections and failover', async () => {
  const f = await fixture(true);
  const partial = await f.box(f.firstScore,instant(18));
  expect((await f.apply(partial)).outcome).toBe('PENDING_DATA');
  expect(await f.anchor(instant(18))).toBeNull();
  const n = f.stat.normalized as Extract<Observation['normalized'],{ kind: 'STAT' }>;
  const complete: Observation = { ...f.stat, observedAt: instant(18,5).toISOString(), revisionToken: '2', revisionOrdinal: 2, normalized: { ...n, stats: { ...f.zeros, PTS: 10, REB: 5 } } };
  expect((await f.apply(complete)).outcome).toBe('ACCEPTED');
  const entry = await f.score(instant(18,5)), firstBox = await f.box(entry,instant(18,5),2);
  const accepted = await f.apply(firstBox); expect(accepted.outcome).toBe('ACCEPTED');
  const original = await f.anchor(instant(18,5));
  expect(original).toMatchObject({ anchorAt: instant(18,5), deadlineAt: new Date(+instant(18,5)+86400000), mode: 'OBSERVED_COMPLETE_BOX', invalidated: false });
  expect((await f.apply(firstBox)).outcome).toBe('DUPLICATE');
  const corrected: Observation = { ...complete, observedAt: instant(19).toISOString(), revisionToken: '3', revisionOrdinal: 3, normalized: { ...n, phase: 'CORRECTION', stats: { ...f.zeros, PTS: 12, REB: 5 } } };
  expect((await f.apply(corrected)).outcome).toBe('ACCEPTED');
  const revisedEntry = await f.score(instant(19));
  expect((await f.apply(await f.box(revisedEntry,instant(19),3))).outcome).toBe('ACCEPTED');
  const failover = { ...await f.box(revisedEntry,instant(20)), provider: `failover-${randomUUID()}` };
  expect((await f.apply(failover)).outcome).toBe('ACCEPTED');
  const official = { ...failover, provider: `official-${randomUUID()}`, observedAt: instant(21).toISOString(), publishedAt: instant(17).toISOString(), normalized: { ...failover.normalized as Extract<Observation['normalized'],{ kind: 'COMPLETE_FINAL_BOX' }>, publicationSemantics: 'OFFICIAL_BOX_SCORE' as const, initialPublishedAt: instant(16).toISOString() } };
  expect((await f.apply(official)).outcome).toBe('ACCEPTED');
  expect(await f.anchor(instant(21))).toEqual(original);
  expect(await db.professionalDataObservation.count({ where: { category: 'BOX_CLOCK', entityKey: `box-clock:${f.game.id}` } })).toBe(1);
  expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).startsAt).toEqual(f.game.startsAt);
  expect((await db.gameCompletionEvidence.findFirstOrThrow({ where: { gameId: f.game.id } })).completedAt).toEqual(instant(14));
});
it('requires audited replacement after invalidation and never shortens an already communicated deadline', async () => {
  const f = await fixture(), firstBox = await f.box(f.firstScore,instant(18));
  const receipt = await f.apply(firstBox), original = await f.anchor(instant(18));
  if (!original) throw Error('Missing first anchor.');
  expect(await db.$transaction(tx => invalidateCorrectionAnchor(tx,f.game.id,receipt.observationId,instant(19),'Synthetic completeness contradiction invalidates original proof.'))).toEqual({ invalidated: true });
  expect(await db.$transaction(tx => invalidateCorrectionAnchor(tx,f.game.id,receipt.observationId,instant(19),'Synthetic duplicate invalidation.'))).toEqual({ invalidated: false });
  expect(await f.anchor(instant(19))).toMatchObject({ id: original.id, invalidated: true });
  const plain = { ...await f.box(f.firstScore,instant(20)), provider: `replacement-${randomUUID()}` };
  expect((await f.apply(plain)).outcome).toBe('PENDING_DATA');
  const replacement = { ...plain, revisionToken: '2', revisionOrdinal: 2, publishedAt: instant(17).toISOString(), normalized: { ...plain.normalized as Extract<Observation['normalized'],{ kind: 'COMPLETE_FINAL_BOX' }>, publicationSemantics: 'OFFICIAL_BOX_SCORE' as const, initialPublishedAt: instant(16).toISOString(), replacement: { invalidatedAnchorId: original.id, reason: 'Audited synthetic replacement preserves the prior communicated deadline.' } } };
  expect((await f.apply(replacement)).outcome).toBe('ACCEPTED');
  const revised = await f.anchor(instant(20));
  expect(revised).toMatchObject({ invalidated: false, deadlineAt: original.deadlineAt });
  expect(+revised!.anchorAt).toBeGreaterThanOrEqual(+original.anchorAt);
  expect(revised!.id).not.toBe(original.id);
  expect(await f.anchor(instant(18))).toEqual(original);
});
it('serializes concurrent publisher observations into one shared game clock and prefers official publication when first established', async () => {
  const f = await fixture(), observed = await f.box(f.firstScore,instant(18));
  const outcomes = await Promise.all([f.apply(observed),f.apply({ ...observed, provider: `parallel-${randomUUID()}` })]);
  expect(outcomes.every(row => row.outcome === 'ACCEPTED')).toBe(true);
  expect(await db.professionalDataObservation.count({ where: { category: 'BOX_CLOCK', entityKey: `box-clock:${f.game.id}` } })).toBe(1);
  const officialFixture = await fixture(), official = await officialFixture.box(officialFixture.firstScore,instant(18));
  const record: Observation = { ...official, publishedAt: instant(17).toISOString(), normalized: { ...official.normalized as Extract<Observation['normalized'],{ kind: 'COMPLETE_FINAL_BOX' }>, publicationSemantics: 'OFFICIAL_BOX_SCORE', initialPublishedAt: instant(16).toISOString() } };
  expect((await officialFixture.apply(record)).outcome).toBe('ACCEPTED');
  expect(await officialFixture.anchor(instant(18))).toMatchObject({ anchorAt: instant(16), deadlineAt: new Date(+instant(16)+86400000), mode: 'OFFICIAL_PUBLICATION' });
});

it('scores actual immutable starters through the observed anchor, accepts in-window corrections and blocks missing snapshots or invalid evidence', async () => {
  const f = await fixture(), user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id,{ name: `Observed competitive clock ${randomUUID()}`, sports: ['NBA'], maxTeams: 2, historical: true, seasonYear: 2043, fillWithComputers: true, competitionType: 'CUMULATIVE' });
  ownedLeagueIds.add(league.id);
  const competition = await db.sportCompetition.findFirstOrThrow({ where: { leagueId: league.id }, include: { leagueSportSeason: true } });
  const period = await db.scoringPeriod.create({ data: { leagueId: league.id, leagueSportId: competition.leagueSportSeason.leagueSportId, competitionId: competition.id, sport: 'NBA', number: 1, startsAt: instant(0), endsAt: instant(48) } });
  await db.competitionPeriodGame.create({ data: { sportCompetitionId: competition.id, scoringPeriodId: period.id, gameId: f.game.id } });
  const roster = await db.fantasyRoster.findFirstOrThrow({ where: { leagueSportId: competition.leagueSportSeason.leagueSportId } });
  const assignStarter = async (playerId: string, slot: 'PG' | 'SG') => {
    const entry = await db.rosterEntry.create({ data: { leagueId: league.id, teamId: roster.teamId, rosterId: roster.id, playerId, sport: 'NBA', seasonId: f.game.seasonId, slot, acquiredAt: instant(9) } });
    await db.rosterAssignmentEvent.create({ data: { leagueId: league.id, teamId: roster.teamId, rosterEntryId: entry.id, toSlot: slot, toSlotIndex: 1, effectiveAt: instant(9), reason: 'Synthetic pre-lock starter assignment', idempotencyKey: randomUUID() } });
    await recordPositionEvidence({ playerId, seasonId: f.game.seasonId, code: slot, kind: 'LISTED', provider: f.provider, externalId: randomUUID(), effectiveAt: instant(9), knownAt: instant(9) });
    await recordAvailabilityEvidence({ playerId, gameId: f.game.id, designation: 'ACTIVE', irEligible: false, provider: f.provider, externalId: randomUUID(), effectiveAt: instant(9), knownAt: instant(9), sourceRecord: { synthetic: true, precision: 'EXPLICIT_FIXTURE' } });
    return entry;
  };
  await assignStarter(f.player.id,'PG');
  const box = await f.box(f.firstScore,instant(18)), beforeCapture = await f.apply(box);
  expect(beforeCapture.outcome, beforeCapture.reason).toBe('PENDING_DATA');
  expect(beforeCapture.reason).toMatch(/snapshot|immutable/i);
  expect(await f.anchor(instant(18))).toBeNull();
  const publication = (at: Date) => periodPublicationTime(db,period.id,at);
  expect(await publication(instant(18))).toBeNull();
  expect(await pendingGameStarterSnapshots(db,f.game.id,instant(18))).toMatchObject({ pending: true });
  expect(await captureGameLineups(f.game.id,instant(18))).toMatchObject({ status: 'CAPTURED', created: 1 });
  const snapshot = await db.gameLineupSnapshot.findFirstOrThrow({ where: { gameId: f.game.id, sportCompetitionId: competition.id, playerId: f.player.id } });
  expect(snapshot).toMatchObject({ isStarter: true, slot: 'PG', lockedAt: instant(10), eligibility: { eligible: true } });
  // Re-evaluate the identical pending observation after required evidence arrives.
  const receipt = await f.apply(box);
  expect(receipt.outcome, receipt.reason).toBe('ACCEPTED');
  expect(receipt.observationId).toBe(beforeCapture.observationId);
  const anchor = await f.anchor(instant(18)); if (!anchor) throw Error('Missing shared correction anchor.');
  expect(await publication(instant(18))).toEqual(anchor.anchorAt);
  expect((await db.playerGameStat.findUniqueOrThrow({ where: { id: f.firstScore.statId } })).sourceKnownAt).toBeNull();
  const firstTotals = await scoreCapturedStarters(db,[competition.id],instant(18),{ periodId: period.id, publicationThrough: anchor.deadlineAt });
  expect(firstTotals).toHaveLength(1);
  expect(firstTotals[0]).toMatchObject({ pointsFor: f.firstScore.totalTenths, scoredStarters: 1, pendingStarters: 0 });
  const originalStat = f.stat.normalized as Extract<Observation['normalized'],{ kind: 'STAT' }>;
  const inWindow: Observation = { ...f.stat, observedAt: instant(19).toISOString(), revisionToken: '2', revisionOrdinal: 2, normalized: { ...originalStat, phase: 'CORRECTION', stats: { ...f.zeros, PTS: 12 } } };
  expect((await f.apply(inWindow)).outcome).toBe('ACCEPTED');
  const corrected = await f.score(instant(19));
  expect(corrected.totalTenths).toBeGreaterThan(f.firstScore.totalTenths);
  expect((await f.apply(await f.box(corrected,instant(19),2))).outcome).toBe('ACCEPTED');
  expect(await publication(instant(19))).toEqual(anchor.anchorAt);
  const late: Observation = { ...inWindow, observedAt: instant(43).toISOString(), revisionToken: '3', revisionOrdinal: 3, normalized: { ...originalStat, phase: 'CORRECTION', stats: { ...f.zeros, PTS: 99 } } };
  expect((await f.apply(late)).outcome).toBe('ACCEPTED');
  const lateEntry = await f.score(instant(43));
  expect(lateEntry.totalTenths).toBeGreaterThan(corrected.totalTenths);
  const protectedTotals = await scoreCapturedStarters(db,[competition.id],instant(43),{ periodId: period.id, publicationThrough: anchor.deadlineAt });
  expect(protectedTotals[0]).toMatchObject({ pointsFor: corrected.totalTenths, scoredStarters: 1, pendingStarters: 0 });
  expect((await scoreCapturedStarters(db,[competition.id],instant(43),{ periodId: period.id }))[0].pointsFor).toBe(lateEntry.totalTenths);
  expect(await publication(instant(43))).toEqual(anchor.anchorAt);
  expect(await db.gameLineupSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).toEqual(snapshot);
  // A second expected starter without its immutable snapshot must block publication,
  // even though another starter and the shared complete-box anchor are valid.
  const missing = await db.player.create({ data: { sport: 'NBA', displayName: `Synthetic missing snapshot ${randomUUID()}`, isSynthetic: true } });
  await assignStarter(missing.id,'SG');
  expect(await pendingGameStarterSnapshots(db,f.game.id,instant(43))).toMatchObject({ pending: true });
  expect((await f.anchor(instant(43)))?.invalidated).toBe(false);
  expect(await publication(instant(43))).toBeNull();
  expect(await db.$transaction(tx => invalidateCorrectionAnchor(tx,f.game.id,receipt.observationId,instant(44),'Audited synthetic complete-box proof invalidation.'))).toEqual({ invalidated: true });
  expect(await publication(instant(44))).toBeNull();
  const invalidTotals = await scoreCapturedStarters(db,[competition.id],instant(44),{ periodId: period.id, publicationThrough: anchor.deadlineAt });
  expect(invalidTotals[0]).toMatchObject({ pointsFor: 0n, scoredStarters: 0, pendingStarters: 1 });
  expect(await db.gameLineupSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).toEqual(snapshot);
});

it('holds conflicting score sources and caps a long period at the individual game deadline', async () => {
 const f=await fixture(), box=await f.box(f.firstScore,instant(18));
 const key={provider:'internal-source-selection',sport:'NBA' as const,stream:`game:${f.game.id}:player:${f.player.id}`};
 await db.professionalSyncState.upsert({where:{provider_sport_stream:key},create:{...key,nextPollAt:instant(18),lastFailure:'SYNTHETIC_SOURCE_CONFLICT'},update:{lastFailure:'SYNTHETIC_SOURCE_CONFLICT'}});
 const blocked=await f.apply(box);expect(blocked.outcome).toBe('PENDING_DATA');expect(blocked.reason).toMatch(/source selection/);expect(await f.anchor(instant(18))).toBeNull();
 await db.professionalSyncState.update({where:{provider_sport_stream:key},data:{lastFailure:null}});
 expect((await f.apply(box)).outcome).toBe('ACCEPTED');
 const laterPeriodDeadline=new Date(+instant(18)+7*86400000);
 const [row]=await db.$queryRaw<{cutoff:Date}[]>`SELECT ${statisticalDeadline(instant(19),laterPeriodDeadline)} AS cutoff FROM "PlayerGameStat" stat WHERE stat.id=${f.firstScore.statId}::uuid`;
 expect(row.cutoff).toEqual(new Date(+instant(18)+86400000));
});

it('exposes a valid observed complete-box operational clock without inventing official publication and reports invalidation as review', async () => {
  const f = await fixture(false,2044), received = instant(18), invalidatedAt = instant(19);
  const before = await professionalDataFreshness({ sport: 'NBA', seasonId: f.game.seasonId, asOf: received });
  expect(before).toMatchObject({ status: 'PROVISIONAL', initialPublishedAt: null, publishedAt: null, operationalAnchorAt: null, operationalDeadlineAt: null, operationalAnchorMode: null, operationalAnchorInvalidated: false });
  const receipt = await f.apply(await f.box(f.firstScore,received));
  expect(receipt.outcome,receipt.reason).toBe('ACCEPTED');
  const anchor = await f.anchor(received); if (!anchor) throw Error('Missing observed box anchor.');
  expect(await professionalDataFreshness({ sport: 'NBA', seasonId: f.game.seasonId, asOf: received })).toMatchObject({ status: 'PROVISIONAL', initialPublishedAt: null, publishedAt: null, operationalAnchorAt: anchor.anchorAt, operationalDeadlineAt: anchor.deadlineAt, operationalAnchorMode: 'OBSERVED_COMPLETE_BOX', operationalAnchorInvalidated: false });
  expect(await db.$transaction(tx => invalidateCorrectionAnchor(tx,f.game.id,receipt.observationId,invalidatedAt,'Synthetic freshness invalidation retains exact publication as unknown.'))).toEqual({ invalidated: true });
  expect(await professionalDataFreshness({ sport: 'NBA', seasonId: f.game.seasonId, asOf: invalidatedAt })).toMatchObject({ status: 'PENDING_REVIEW', initialPublishedAt: null, publishedAt: null, operationalAnchorInvalidated: true });
  expect(await professionalDataFreshness({ sport: 'NBA', seasonId: f.game.seasonId, asOf: received })).toMatchObject({ status: 'PROVISIONAL', operationalAnchorInvalidated: false });
});
