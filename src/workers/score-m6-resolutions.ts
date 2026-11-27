import {createReadStream,createWriteStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {scoreSimulationAppearance} from '@/simulation/scoring';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Input and output paths required.');const destination=createWriteStream(output);
for await(const line of createInterface({input:createReadStream(input)})){const row=JSON.parse(line),score=scoreSimulationAppearance({role:row.role,stats:row.resolvedStats});const result={...row,pointsTenths:score.pointsTenths,missingStats:score.missingStats,scoringConfigurationFingerprint:score.scoringConfigurationFingerprint};if(!destination.write(JSON.stringify(result)+'\n'))await once(destination,'drain');}destination.end();await once(destination,'finish');
