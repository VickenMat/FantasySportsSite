import {it,expect} from 'vitest';
import {currentPositionStatus} from '@/positions/current-position-status';
import {playerSnapshotsFromRelease} from '@/ingestion/open-data/player-snapshots';
const at=new Date('2026-11-27T04:00:00Z'),playerId='actor';
function rows(position:string){const decoded=playerSnapshotsFromRelease({proof:{id:'nfl-rosters-2026',sport:'NFL',sourceUrl:'https://fixture.invalid/roster',sha256:'a'.repeat(64),receivedAt:'2026-11-27T01:00:00Z',artifactModifiedAt:'2026-11-27T00:00:00Z'},rows:[{gsis_id:'00-1234567',position}],at:'2026-11-27T02:00:00Z',policyAdoptedAt:'2026-11-27T00:18:32.000Z'});return decoded.observations.filter(row=>row.normalized.facet.type==='POSITION').map(row=>({...row,observedAt:new Date(row.observedAt),revisionOrdinal:BigInt(row.revisionOrdinal),decisions:[{outcome:'ACCEPTED',decidedAt:new Date('2026-11-27T03:00:00Z'),targets:{playerId,operationalEffectiveAt:'2026-11-27T03:00:00Z'}}]}));}
const base={playerId,sport:'NFL',seasonYear:2026,asOf:at,positions:[]};
it('distinguishes an explicitly retained unsupported professional role from unknown eligibility without granting a fantasy slot',()=>{
 expect(currentPositionStatus({...base,observations:rows('DB')})).toEqual({positionStatus:'KNOWN_UNSUPPORTED_ROLE',professionalPositions:['DB']});
 expect(currentPositionStatus({...base,observations:[]})).toEqual({positionStatus:'UNKNOWN',professionalPositions:[]});
});
it('retains supported position provenance without adding any slot or changing acquisitions',()=>expect(currentPositionStatus({...base,positions:['WR'],observations:rows('WR')})).toEqual({positionStatus:'SUPPORTED',professionalPositions:['WR']}));
it('does not present expired or retracted evidence as a known current unsupported role',()=>{
 expect(currentPositionStatus({...base,asOf:new Date('2026-12-06T00:00:00Z'),observations:rows('OL')})).toEqual({positionStatus:'UNKNOWN',professionalPositions:[]});
 expect(currentPositionStatus({...base,observations:rows('OL').map(row=>({...row,normalized:{...row.normalized,retracted:true}}))})).toEqual({positionStatus:'UNKNOWN',professionalPositions:[]});
});

it.each(['UNKNOWN','UNK','N/A','NEWCODE'])('preserves %s as unknown source evidence rather than established unsupported eligibility',position=>expect(currentPositionStatus({...base,observations:rows(position)})).toEqual({positionStatus:'UNKNOWN',professionalPositions:[position]}));
