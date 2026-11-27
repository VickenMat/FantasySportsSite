import {fingerprint} from '../contracts';
import type {CompetitiveGameStage} from './competitive-records';
/** Release-body hashes prove provenance; per-game meaning determines statistical replay.
 * Keep complete row semantics (including participation, minutes and recorded NFL
 * position), canonical inventory and nulls; omit only enclosing artifact receipts. */
export function recurringCompetitiveContentFingerprint(stage:CompetitiveGameStage){
 const {participantSideEvidence,gameIdentityEvidence,...game}=stage.game;void participantSideEvidence;void gameIdentityEvidence;
 return fingerprint({version:'recurring-game-content-1',game:{...game,teams:[...game.teams].sort((a,b)=>a.id.localeCompare(b.id))},expectedSourcePlayers:stage.expectedSourcePlayers,historicalV9CompletePlayers:stage.historicalV9CompletePlayers,completeBoxBindingReady:stage.completeBoxBindingReady,holds:stage.holds,
  records:stage.records.map(row=>({provider:row.provider,sport:row.sport,entityKey:row.entityKey,normalized:row.normalized,sourceRecord:row.raw.sourceRecord??null,historicalObservedPositions:row.raw.historicalObservedPositions??null})).sort((a,b)=>a.entityKey.localeCompare(b.entityKey))});
}
