import { z } from 'zod';
const ref = z.object({ provider: z.string().min(1).max(100), externalId: z.string().min(1).max(200) }).strict();
const facet = z.discriminatedUnion('type', [
  z.object({ type: z.literal('POSITION'), sourcePosition: z.string().min(1).max(40), professionalPosition: z.string().min(1).max(12), fantasyPositions: z.array(z.string().regex(/^[A-Z0-9]{1,12}$/)).max(12), context: z.enum(['ROSTER_SNAPSHOT', 'DATED_GAME_ROSTER']) }).strict(),
  z.object({ type: z.literal('TEAM_ASSIGNMENT'), team: ref, sourceTeamId: z.string().min(1), assignment: z.literal('ROSTERED') }).strict(),
  z.object({ type: z.literal('AVAILABILITY'), sourceStatus: z.string().min(1).max(100), sourceType: z.string().min(1).max(100), designation: z.enum(['ACTIVE','QUESTIONABLE','DOUBTFUL','OUT','INJURED_RESERVE','SUSPENDED','RETIRED','UNKNOWN']), irEligible: z.boolean() }).strict(),
  z.object({ type: z.literal('ROOKIE'), eligible: z.boolean(), sourceField: z.literal('rookie_year'), sourceYear: z.number().int().min(1900).max(2200) }).strict(),
  z.object({ type: z.literal('POSITION_AGGREGATE'), evidenceSeasonStartYear: z.number().int().min(1900).max(2200), code: z.enum(['C','1B','2B','3B','SS','LF','CF','RF','P','SP','RP','DH']), countBasis: z.enum(['FIELDING','STARTING_PITCHING','RELIEF_PITCHING','DESIGNATED_HITTER']), starts: z.number().int().nonnegative().max(500).nullable(), appearances: z.number().int().nonnegative().max(500).nullable(), scope: z.literal('INDEPENDENT_THRESHOLD'), sourceTeamId: z.string().min(1), sourceRows: z.array(z.string().min(1)).min(1).max(100), excludesDuplicateTeamTotals: z.literal(true) }).strict(),
]);
export const playerSnapshotSchema = z.object({
  kind: z.literal('PLAYER_SNAPSHOT'), player: ref, seasonStartYear: z.number().int().min(1900).max(2200),
  sourceRecordId: z.string().min(1).max(300), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSnapshotDate: z.iso.date().nullable(), sourceDatePrecision: z.enum(['DAY','SEASON','OBSERVED']),
  firstObservedAt: z.iso.datetime({ offset: true }), policyAdoptedAt: z.iso.datetime({ offset: true }),
  validFrom: z.iso.datetime({ offset: true }), validUntil: z.iso.datetime({ offset: true }).nullable(),
  policyVersion: z.literal('approved-observed-player-snapshot-1'), retracted: z.boolean(), facet,
}).strict().superRefine((n, ctx) => {
  if (+new Date(n.validFrom) < Math.max(+new Date(n.firstObservedAt), +new Date(n.policyAdoptedAt))) ctx.addIssue({ code: 'custom', message: 'Prospective snapshot validity must respect observation and policy adoption.' });
  if (n.validUntil && +new Date(n.validUntil) <= +new Date(n.validFrom)) ctx.addIssue({ code: 'custom', message: 'Snapshot expiry must follow prospective validity.' });
  if ((n.sourceDatePrecision === 'DAY') !== Boolean(n.sourceSnapshotDate)) ctx.addIssue({ code: 'custom', message: 'Date precision requires the literal source date, never fabricated midnight.' });
  if (n.facet.type === 'AVAILABILITY' && ['UNKNOWN','RETIRED','ACTIVE','QUESTIONABLE','DOUBTFUL'].includes(n.facet.designation) && n.facet.irEligible) ctx.addIssue({ code: 'custom', message: 'Unsupported designations cannot grant IR.' });
  if (n.facet.type === 'POSITION_AGGREGATE') {
    const f = n.facet;
    if (![n.seasonStartYear, n.seasonStartYear - 1].includes(f.evidenceSeasonStartYear)) ctx.addIssue({ code: 'custom', message: 'MLB evidence applies only to current/following season.' });
    const basis = f.code === 'SP' ? 'STARTING_PITCHING' : f.code === 'RP' ? 'RELIEF_PITCHING' : f.code === 'DH' ? 'DESIGNATED_HITTER' : 'FIELDING';
    if (f.countBasis !== basis || f.starts === null && f.appearances === null || f.starts !== null && f.appearances !== null && f.starts > f.appearances || f.code === 'SP' && (f.starts === null || f.appearances !== null && f.starts !== f.appearances) || f.code === 'RP' && (f.appearances === null || f.starts !== null && f.starts !== 0)) ctx.addIssue({ code: 'custom', message: 'Retain the explicit participation/count basis; no generic pitching-role substitution.' });
  }
});
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;
export function mapProfessionalSnapshotPosition(sport: string, source: string) {
  const professionalPosition = source.trim().toUpperCase();
  const code = sport === 'NHL' ? ({L:'LW',R:'RW',C:'C',D:'D',G:'G',LW:'LW',RW:'RW'} as Record<string,string>)[professionalPosition] : sport === 'NFL' && ['QB','RB','FB','WR','TE'].includes(professionalPosition) ? professionalPosition : null;
  return { professionalPosition, fantasyPositions: code ? [code] : [] };
}
export function mapInjurySnapshot(sport: string, status: string, sourceType: string) {
  const statuses: Record<string,'ACTIVE'|'QUESTIONABLE'|'DOUBTFUL'|'OUT'|'INJURED_RESERVE'|'SUSPENDED'|'UNKNOWN'> = {INJURY_STATUS_ACTIVE:'ACTIVE',INJURY_STATUS_QUESTIONABLE:'QUESTIONABLE',INJURY_STATUS_DOUBTFUL:'DOUBTFUL',INJURY_STATUS_OUT:'OUT',INJURY_STATUS_IR:'INJURED_RESERVE',INJURY_STATUS_SUSPENSION:'SUSPENDED',INJURY_STATUS_SUSPENDED:'SUSPENDED'};
  const designation = statuses[sourceType] ?? 'UNKNOWN';
  const expected: Record<string,string[]> = {ACTIVE:['Active'],QUESTIONABLE:['Questionable'],DOUBTFUL:['Doubtful'],OUT:['Out'],INJURED_RESERVE:['Injured Reserve'],SUSPENDED:['Suspension','Suspended']};
  if (designation !== 'UNKNOWN' && !expected[designation].includes(status)) return { designation:'UNKNOWN' as const, irEligible:false, conflict:true };
  return { designation, irEligible: designation === 'INJURED_RESERVE' || sport === 'NFL' && ['OUT','SUSPENDED'].includes(designation), conflict:false };
}
export type SnapshotObservation = {provider:string;entityKey:string;revisionOrdinal:bigint|null;observedAt:Date;normalized:unknown;decisions:{outcome:string;decidedAt:Date;targets:unknown}[]};
/** Latest accepted or safely actor-bound conflict per immutable snapshot stream. */
export function snapshotStreamHeads<T extends SnapshotObservation>(rows:readonly T[],asOf:Date){
 const latest=new Map<string,{row:T;value:PlayerSnapshot;revision:bigint;conflict:boolean;targets:{playerId:string;seasonId?:string;operationalEffectiveAt?:string}}>();
 for(const row of rows){
  const parsed=playerSnapshotSchema.safeParse(row.normalized),decision=row.decisions.find(value=>value.decidedAt<=asOf),target=decision?.targets as{playerId?:string;seasonId?:string;operationalEffectiveAt?:string;snapshotConflict?:boolean}|undefined;
  if(!parsed.success||!target?.playerId||!decision||!(decision.outcome==='ACCEPTED'||decision.outcome==='QUARANTINED'&&target.snapshotConflict)||row.observedAt>asOf||row.revisionOrdinal==null||+new Date(parsed.data.validFrom)>+asOf||typeof target.operationalEffectiveAt!=='string'||+new Date(target.operationalEffectiveAt)>+asOf)continue;
  const key=`${row.provider}:${row.entityKey}`,old=latest.get(key),conflict=decision.outcome==='QUARANTINED';
  if(!old||row.revisionOrdinal>old.revision)latest.set(key,{row,value:parsed.data,revision:row.revisionOrdinal,conflict,targets:{...target,playerId:target.playerId}});
  else if(row.revisionOrdinal===old.revision){
   old.conflict ||= conflict||JSON.stringify(old.value)!==JSON.stringify(parsed.data);
   if(conflict||row.observedAt>old.row.observedAt){old.row=row;old.value=parsed.data;old.targets={...target,playerId:target.playerId};}
  }
 }
 return latest;
}
/** Pure as-of projection. Retraction/expiry/conflict never resurrects an older grant. */
export function snapshotPositionEligibility(input:{playerId:string;sport:string;seasonYear:number;asOf:Date;observations:readonly SnapshotObservation[]}) {
 const latest=new Map([...snapshotStreamHeads(input.observations,input.asOf)].filter(([,entry])=>entry.targets.playerId===input.playerId&&entry.value.seasonStartYear===input.seasonYear&&['POSITION','POSITION_AGGREGATE'].includes(entry.value.facet.type)));
  const positionSets:string[][]=[], aggregates:string[]=[], conflicts:string[]=[];
  for(const [key,{value,conflict}]of latest){
    if(conflict){conflicts.push(key);continue;}
    if(value.retracted||value.validUntil&&+new Date(value.validUntil)<=+input.asOf)continue;
    if(value.facet.type==='POSITION')positionSets.push([...value.facet.fantasyPositions].sort());
    else if(value.facet.type==='POSITION_AGGREGATE'&&input.sport==='MLB'&&((value.facet.starts??-1)>=10||(value.facet.appearances??-1)>=20))aggregates.push(value.facet.code);
  }
  if(positionSets.some(set=>JSON.stringify(set)!==JSON.stringify(positionSets[0])))conflicts.push('CROSS_SOURCE_POSITION_CONFLICT');
  return{available:latest.size>0,positions:conflicts.length?[]:[...new Set([...(positionSets[0]??[]),...aggregates])].sort(),snapshotConflicts:conflicts.sort()};
}
