import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {reviewedRosterDiscoverySchema} from './reviewed-roster-discovery';
/** Exact known six official-ID box discoveries, not an open-ended import. */
export async function validateCurrentNbaDiscoverySource(raw:unknown){
 const manifest=reviewedRosterDiscoverySchema.parse(raw),allowed=new Set(['1631115','1641725','1642396','1642923','1642933','1643758']);
 if(manifest.candidates.length!==6||manifest.bridges.length||new Set(manifest.candidates.map(row=>row.sourcePlayerId)).size!==6||manifest.candidates.some(row=>!allowed.has(row.sourcePlayerId))||manifest.sourceProofs.length!==1)throw Error('Exact six NBA direct-ID scope changed.');
 const proof=manifest.sourceProofs[0];
 if(proof.sourceReference!=='https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_player_boxscores/player_boxscores_2027.csv'||proof.sha256!=='e57f6308f7f4a8184c5ccab14bab1f906f667e80715414fae9c582d147d7f5f1')throw Error('Reviewed NBA direct source changed.');
 const bytes=await readFile(`data/provider_previews/objects/${proof.sha256}`);if(createHash('sha256').update(bytes).digest('hex')!==proof.sha256)throw Error('NBA direct source bytes changed.');
 const rows=parse(bytes,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
 for(const candidate of manifest.candidates){const records=rows.filter(row=>row.person_id===candidate.sourcePlayerId);if(!records.length||records.some(row=>`${row.first_name} ${row.family_name}`.trim()!==candidate.displayName||row.season!=='2027')||!records.some(row=>row.team_id===candidate.sourceTeamId&&(row.position??'')===candidate.sourceObservedPosition))throw Error('NBA direct official ID/name/season/team evidence differs.');}
 return manifest;
}
