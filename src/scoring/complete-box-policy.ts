import {z} from 'zod';
export const completeFinalBoxSchema=z.object({
 kind:z.literal('COMPLETE_FINAL_BOX'),game:z.object({provider:z.string().min(1),externalId:z.string().min(1)}).strict(),
 policyVersion:z.literal('CONSERVATIVE_OBSERVED_V1'),sourceFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
 completeness:z.object({allExpectedRowsPresent:z.literal(true),rolesResolved:z.literal(true),noUnresolvedContradictions:z.literal(true),expectedPlayers:z.number().int().positive().max(5000)}).strict(),
 statistics:z.array(z.object({playerId:z.uuid(),role:z.enum(['FOOTBALL','HITTER','PITCHER','BASKETBALL','SKATER','GOALIE']),statId:z.uuid(),statHash:z.string().min(1),scoreEntryId:z.uuid()}).strict()).min(1).max(5000),
 publicationSemantics:z.enum(['OBSERVED_COMPLETE_BOX','OFFICIAL_BOX_SCORE']),initialPublishedAt:z.iso.datetime({offset:true}).nullable(),
 replacement:z.object({invalidatedAnchorId:z.uuid(),reason:z.string().min(10).max(2000)}).strict().optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.statistics.length!==value.completeness.expectedPlayers||new Set(value.statistics.map(row=>row.playerId)).size!==value.statistics.length)ctx.addIssue({code:'custom',message:'Each expected athlete must have exactly one resolved scoring role.'});
 if(value.publicationSemantics==='OBSERVED_COMPLETE_BOX'&&value.initialPublishedAt!==null)ctx.addIssue({code:'custom',message:'An observed box cannot fabricate official publication.'});
});
