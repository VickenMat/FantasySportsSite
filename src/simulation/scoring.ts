import type {GameStatRole} from '@/generated/prisma/enums';
import {calculateScore,type StatValues} from '@/scoring/engine';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import {fingerprint} from '@/ingestion/contracts';
export const simulationV9Fingerprint=fingerprint(ubpV9Rules);
/** A direct production-engine call; incomplete numerical totals remain withheld. */
export function scoreSimulationAppearance(input:{role:GameStatRole;stats:StatValues;teEligible?:boolean|null}){const result=calculateScore(ubpV9Rules,input);return{...result,pointsTenths:result.missingStats.length?null:result.totalTenths,scoringConfigurationFingerprint:simulationV9Fingerprint};}
