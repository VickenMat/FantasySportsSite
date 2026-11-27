import type { SourceRow } from './read';
export type NbaGameIdentityEvidence={sourceGameId:string;sourceSha256:string;crosswalk:SourceRow;observationId:string;observationHash:string};
type Canonical={externalId:string;gameDate:string|null;teams:{externalId:string;side:string}[]};
/** A declared publisher ID bridge plus both numeric participant IDs; never a date/name merge. */
export function validNbaGameBridge(game:Canonical,schedule:SourceRow,evidence:NbaGameIdentityEvidence){
 const row=evidence.crosswalk;
 return /^[a-f0-9]{64}$/.test(evidence.sourceSha256)&&evidence.sourceGameId===schedule.game_id&&row.nba_game_id===schedule.game_id&&row.espn_game_id===game.externalId&&row.game_date===schedule.game_date&&game.gameDate===schedule.game_date&&row.season===schedule.season&&row.nba_home_team_id===schedule.home_team_id&&row.nba_away_team_id===schedule.away_team_id&&row.match_method==='both'&&row.match_confidence==='1.0'&&(['HOME','AWAY'] as const).every(side=>game.teams.some(team=>team.side===side&&team.externalId===row[`${side.toLowerCase()}_espn_team_id`]));
}
