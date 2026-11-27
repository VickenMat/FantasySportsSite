import {createInterface} from 'node:readline';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {enrichHistoricalNhlRow} from '@/simulation/preparation/enrichment';
import type {PreparedHistoricalRow} from '@/simulation/preparation/records';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Expected input.jsonl output.jsonl.');const writer=createWriteStream(output);
for await(const text of createInterface({input:createReadStream(input),crlfDelay:Infinity})){const value=JSON.parse(text) as {row:PreparedHistoricalRow;overlay:unknown},result=enrichHistoricalNhlRow(value.row,value.overlay);if(!writer.write(JSON.stringify(result)+'\n'))await once(writer,'drain');}writer.end();await once(writer,'finish');
