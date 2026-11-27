import {createInterface} from 'node:readline';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {historicalScoringReadiness} from '@/simulation/preparation/scoring-readiness';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Expected exact source-qualified gate input/output paths.');const writer=createWriteStream(output);
for await(const text of createInterface({input:createReadStream(input),crlfDelay:Infinity})){const row=JSON.parse(text),gate=historicalScoringReadiness(row.gateInput);const result={...row.key,...gate,sourceComparisonStatus:row.gateInput.sourceComparisonStatus,participation:row.gateInput.participation,selectedRole:row.gateInput.selectedRole,conflictFields:row.conflictFields,gatedV9PointsTenths:gate.retrospectiveScoringEligible?row.enrichedV9PointsTenths:null};if(!writer.write(JSON.stringify(result)+'\n'))await once(writer,'drain');}writer.end();await once(writer,'finish');
