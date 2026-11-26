import { readFile,writeFile,mkdir,stat } from "node:fs/promises";
import { join } from "node:path";
import { hashFile } from "@/imports/csv";
import { parquetSources } from "@/parquet/config";
import type { Sport } from "@/generated/prisma/enums";
import { csvRecords,compareRecoveredArchive } from "@/ingestion/recovered-archives";
const directory='data/raw/recovered',output='data/position_enrichment';
await mkdir(output,{recursive:true});
const names=['nfl_2016_2026_final.csv','mlb_2016_2026_final.csv','nba_2016-2027_final.csv','nhl_2016_2027_final.csv','mlb_positions_repaired.csv','nba_positions_repaired.csv','_nba_player_positions_2016_2026.csv'];
const inventory=[];
for(const name of names) {
 let rows=0,columns:string[]=[];
 for await(const row of csvRecords(join(directory,name))){rows++;if(!columns.length)columns=Object.keys(row);}
 inventory.push({file:name,bytes:(await stat(join(directory,name))).size,sha256:await hashFile(join(directory,name)),rows,columns});
}
await writeFile(join(output,'recovered_inventory.json'),JSON.stringify(inventory,null,2)+'\n');
const comparisons=[];
for(const [index,sport]of(['NFL','MLB','NBA','NHL'] as Sport[]).entries()) {
 console.log(`Comparing ${sport} canonical rows and normalized values`);
 const result=await compareRecoveredArchive(sport,join(directory,names[index]),join('data/player_data',parquetSources[sport].filename));
 comparisons.push({...result,csvSha256:inventory[index].sha256,parquetSha256:await hashFile(join('data/player_data',parquetSources[sport].filename))});
 await writeFile(join(output,'recovered_comparison.json'),JSON.stringify(comparisons,null,2)+'\n');
 console.log(JSON.stringify(result));
}
const accepted=JSON.parse(await readFile('reports/m2-5-analysis.json','utf8'));
if(comparisons.some(row=>accepted.reports.find((r:{sport:string})=>r.sport===row.sport).source.sha256!==row.parquetSha256))throw new Error('Accepted Parquet fingerprint changed.');
