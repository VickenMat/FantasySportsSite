import {it,expect} from 'vitest';
import {playerSnapshotsFromRelease} from '@/ingestion/open-data/player-snapshots';
it('holds an unchanged expired body at processing time without changing its original prospective floor',()=>{
 const input={proof:{id:'nfl-rosters-2026',sport:'NFL' as const,sourceUrl:'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv',sha256:'a'.repeat(64),receivedAt:'2026-11-27T01:00:00Z',artifactModifiedAt:'2026-11-27T00:00:00Z'},rows:[{gsis_id:'00-0038496',position:'WR',status:'ACT',team:'NYJ',rookie_year:'2023'}],policyAdoptedAt:'2026-11-27T00:18:32.000Z'};
 const fresh=playerSnapshotsFromRelease({...input,at:'2026-11-27T02:00:00Z'});
 expect(fresh.observations.length).toBeGreaterThan(0);
 expect(fresh.observations.every(row=>row.normalized.validFrom==='2026-11-27T01:00:00.000Z')).toBe(true);
 const expired=playerSnapshotsFromRelease({...input,at:'2026-12-04T01:00:00Z'});
 expect(expired.observations.filter(row=>row.normalized.facet.type!=='ROOKIE')).toHaveLength(0);
 // Explicit source rookie-year is a stable biographical fact, not an active roster assertion.
 expect(expired.observations.every(row=>row.normalized.facet.type==='ROOKIE')).toBe(true);
 expect(expired.holds.length).toBeGreaterThan(0);
 expect(expired.holds.every(hold=>hold.reason==='SNAPSHOT_FRESHNESS_EXPIRED')).toBe(true);
});
