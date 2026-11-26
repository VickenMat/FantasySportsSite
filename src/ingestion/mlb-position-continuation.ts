/** Local-only source verification for the separate reviewed MLB historical-position continuation. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { hashFile } from '@/imports/csv';
import { csvRecords } from './recovered-archives';
import { historicalPositionRepairSchema } from '@/server/historical-position-reconciliation';

export const mlbPositionContinuationFingerprint = 'ee09780d243fc11e0246e23678554109c3b717acaf746b78f15cc770218ddebc';
const statisticalHash = 'a58fee138f99f825b9af9737e93cd6c512ee7ab6c43ca1fa23dffab2819211d0';
const positionHash = '7d642767b45d9e26f31778ebbf0456715d785de3ad3d274ec7bee1f07b7aec72';
const proposalHash = 'ea5573973ed326316f4745932fa331b440af1494d80b3a409d1ebd43986601ef';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export async function loadMlbPositionContinuation() {
  const directory = 'data/position_enrichment';
  const raw = JSON.parse(await readFile(`${directory}/mlb_position_additional_source_proposal.json`, 'utf8'));
  const { sourceProposalFingerprint, ...body } = raw;
  if (sourceProposalFingerprint !== proposalHash || sha(canonical(body)) !== proposalHash) throw Error('Reviewed MLB source proposal changed.');
  if (await hashFile('data/raw/recovered/mlb_2016_2026_final.csv') !== statisticalHash || await hashFile('data/raw/recovered/mlb_positions_repaired.csv') !== positionHash) throw Error('Immutable recovered MLB source changed.');
  const manifest = historicalPositionRepairSchema.parse(JSON.parse(await readFile(`${directory}/mlb_nine_role_historical_manifest.json`, 'utf8')));
  const preview = z.object({ fingerprint: z.literal(mlbPositionContinuationFingerprint), changes: z.literal(251), players: z.literal(9), sourceHash: z.string(),
    targets: z.array(z.object({ priorStatId: z.uuid(), priorHash: z.string(), positions: z.array(z.string()), sourceReference: z.string(), knownAt: z.string() })).length(251),
  }).passthrough().parse(JSON.parse(await readFile(`${directory}/mlb_nine_role_historical_preview.json`, 'utf8')));
  if (manifest.sport !== 'MLB' || manifest.sourceProvider !== 'recovered-mlb-game-role-evidence' || manifest.rows.length !== 9 || sha(JSON.stringify(manifest)) !== preview.sourceHash || sha(JSON.stringify({ sourceHash: preview.sourceHash, targets: preview.targets })) !== mlbPositionContinuationFingerprint) throw Error('Reviewed historical manifest or target binding changed.');
  const proofs = new Map<number, {sha256: string; playerId: string; gameId: string; teamId: string; started: boolean}>();
  for (const candidate of raw.historicalRoleCandidates) {
    const row = manifest.rows.find(value => value.playerExternalId === candidate.sourcePlayerId);
    const evidence = candidate.explicit2026Pitching, games = evidence.games as {sourceGameId: string; started: boolean; proofs: {sourceLine: number; rowSha256: string; sourceTeamId: string}[]}[];
    if (!row || row.seasonStartYear !== 2026 || row.identityProvider !== 'v9-historical' || new Set(games.map(game => game.sourceGameId)).size !== games.length) throw Error('Missing or duplicated reviewed game evidence.');
    const starts = games.filter(game => game.started).length, relief = games.length - starts;
    const positions = [...(starts >= 10 ? ['SP'] : []), ...(relief >= 20 ? ['RP'] : [])];
    if (!positions.length || JSON.stringify(positions) !== JSON.stringify(row.positions) || starts !== evidence.knownStarts || relief !== evidence.knownReliefAppearances) throw Error('Historical role threshold does not match exact game proofs.');
    for (const game of games) {
      if (!game.proofs.length) throw Error('Empty game proof.');
      for (const proof of game.proofs) {
        const value = { sha256: proof.rowSha256, playerId: candidate.sourcePlayerId, gameId: game.sourceGameId, teamId: proof.sourceTeamId, started: game.started };
        if (proofs.has(proof.sourceLine) && canonical(proofs.get(proof.sourceLine)) !== canonical(value)) throw Error('Conflicting recovered source-line proof.');
        proofs.set(proof.sourceLine, value);
      }
    }
  }
  if (new Set(manifest.rows.map(row => row.playerExternalId)).size !== 9) throw Error('Expected nine distinct source players.');
  let line = 1, verified = 0;
  for await (const row of csvRecords('data/raw/recovered/mlb_2016_2026_final.csv')) {
    const proof = proofs.get(++line);
    if (!proof) continue;
    if([row.gamesPlayed,row.gamesPitched,row.gamesStarted].some(value=>value==null||String(value).trim()===''))throw Error('Unknown pitching participation or starts cannot become zero.');
    if (sha(canonical(row)) !== proof.sha256 || row.season !== '2026' || row.category !== 'pitching' || row.player_id !== proof.playerId || row.game_id !== proof.gameId || row.team_id !== proof.teamId || Number(row.gamesPlayed) !== 1 || Number(row.gamesPitched) !== 1 || Number(row.gamesStarted) !== Number(proof.started)) throw Error('Recovered game proof failed direct source verification.');
    verified++;
  }
  if (verified !== proofs.size) throw Error('Missing reviewed recovered source lines.');
  return { manifest, preview, sourceProofs: { statisticalHash, positionHash, proposalHash, verifiedGameRows: verified }, directory };
}
