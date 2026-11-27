import {snapshotStreamHeads,type SnapshotObservation} from './player-snapshot-policy';
// Explicit non-fantasy categories present in the retained nflverse roster schema.
const knownUnsupportedNflRoles=new Set(['DB','OL','LB','DL','K','LS','P']);
/** Display evidence status only; this does not change acquisition or slot policy. */
export function currentPositionStatus(input:{playerId:string;sport:string;seasonYear:number;asOf:Date;positions:readonly string[];observations:readonly SnapshotObservation[]}){
 const heads=[...snapshotStreamHeads(input.observations,input.asOf).values()].filter(row=>row.targets.playerId===input.playerId&&row.value.seasonStartYear===input.seasonYear&&row.value.facet.type==='POSITION'&&!row.value.retracted&&(!row.value.validUntil||new Date(row.value.validUntil)>input.asOf));
 const professionalPositions=[...new Set(heads.flatMap(row=>row.value.facet.type==='POSITION'?[row.value.facet.professionalPosition]:[]))].sort();
 if(heads.some(row=>row.conflict)||professionalPositions.length>1)return{positionStatus:'CONFLICT' as const,professionalPositions:[] as string[]};
 if(input.positions.length)return{positionStatus:'SUPPORTED' as const,professionalPositions};
 if(input.sport==='NFL'&&professionalPositions.length===1&&knownUnsupportedNflRoles.has(professionalPositions[0])&&heads.every(row=>row.value.facet.type==='POSITION'&&row.value.facet.fantasyPositions.length===0))return{positionStatus:'KNOWN_UNSUPPORTED_ROLE' as const,professionalPositions};
 return{positionStatus:'UNKNOWN' as const,professionalPositions};
}
