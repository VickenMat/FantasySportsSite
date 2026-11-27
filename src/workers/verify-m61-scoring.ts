import {readFile,writeFile} from 'node:fs/promises';
import {scoreSimulationAppearance,simulationV9Fingerprint} from '@/simulation/scoring';
import {ubpV9Rules} from '@/scoring/ubp-v9';
import type {GameStatRole} from '@/generated/prisma/enums';
const rows=JSON.parse(await readFile('data/simulation/approved_model_v1/scoring-parity-samples.json','utf8')) as {role:GameStatRole;stats:Record<string,number|null>;teEligible:boolean;expectedTenths:number;sport:string;year:number;nativePlayer:string;nativeGame:string}[];
for(const row of rows){const scored=scoreSimulationAppearance(row);if(scored.pointsTenths!==row.expectedTenths)throw Error('Historical parity mismatch '+JSON.stringify(row));}
await writeFile('reports/m61-historical-scoring-parity.json',JSON.stringify({version:'m61-historical-scoring-parity-1',samples:rows.map(({stats,...row})=>({...row,inputKeys:Object.keys(stats)})),sampleCount:rows.length,allMatch:true,activeRules:ubpV9Rules.length,scoringFingerprint:simulationV9Fingerprint,scorer:'Production calculateScore; preexisting frozen prepared expectations',heldout2025Excluded:true,productionWrites:0},null,2)+'\n');
