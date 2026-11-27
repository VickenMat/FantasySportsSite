/** Streaming protocol for the PyArrow coordinator; no DB or network. */
import {createInterface} from 'node:readline';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import type {Sport} from '@/generated/prisma/enums';
import {prepareHistoricalRow,resolveHistoricalMlbRoles,historicalNbaPosition,type PreparedHistoricalRow,type PositionContext} from '@/simulation/preparation/records';
const [sport,input,output]=process.argv.slice(2) as [Sport,string,string];if(!['NFL','MLB','NBA','NHL'].includes(sport)||!input||!output)throw Error('Expected SPORT input.jsonl output.jsonl.');
const writer=createWriteStream(output);let group:PreparedHistoricalRow[]=[];
const write=async(row:PreparedHistoricalRow)=>{if(!writer.write(JSON.stringify(row)+'\n'))await once(writer,'drain');};
const flush=async()=>{if(!group.length)return;for(const row of sport==='MLB'&&group[0].valid?resolveHistoricalMlbRoles(group):group)await write(row);group=[];};
for await(const text of createInterface({input:createReadStream(input),crlfDelay:Infinity})){const value=JSON.parse(text) as {raw:Record<string,string>;sourceRow:number;position?:PositionContext&{sourcePosition?:string}},position=value.position?.sourcePosition?{...historicalNbaPosition(value.position.sourcePosition),provenance:value.position.provenance}:value.position,row=prepareHistoricalRow(sport,value.raw,value.sourceRow,position);if(sport!=='MLB'){await write(row);continue;}if(group.length&&(row.playerGameKey!==group[0].playerGameKey||!row.valid||!group[0].valid))await flush();group.push(row);}
await flush();writer.end();await once(writer,'finish');
