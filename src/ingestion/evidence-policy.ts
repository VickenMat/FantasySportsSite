/** User-approved November26 observed-evidence policy. These permissions describe
 * source semantics; they do not authorize new development backfills by themselves.
 */
export const observedEvidencePolicy='CONSERVATIVE_OBSERVED_V1' as const;
export const observedPolicyAdoptedAt=new Date('2026-11-27T00:18:32.000Z');
export function permitsObservedEvidence(provider:string){
 if(['nflverse-open-data','sportsdataverse-open-data'].includes(provider))return true;
 try{const u=new URL(process.env.DATABASE_URL??'');return process.env.NODE_ENV==='test'&&u.pathname==='/fantasy_evolution_test'&&Boolean(u.searchParams.get('schema')?.startsWith('integration_'))&&(process.env.AUTHORIZED_TEST_DATABASES??'').split(',').includes('fantasy_evolution_test');}catch{return false;}
}
