import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{gunzipSync}from'node:zlib';
import{parse}from'csv-parse/sync';
import{asyncBufferFromFile,parquetReadObjects}from'hyparquet';
import{openDataSources}from'./sources';
export type SourceRow=Record<string,string>;
export async function sourceProduct(id:string){
 const source=openDataSources.find(s=>s.id===id);if(!source)throw Error('Unknown licensed product.');
 let path=`data/provider_previews/${source.directory}/${source.filename}`;
 const metadata=JSON.parse(await readFile(`data/provider_previews/${source.directory}/${source.filename.replace(/\.csv(?:\.gz)?$/,'')}.source.json`,'utf8'));
 let bytes:Uint8Array;try{const objectPath=`data/provider_previews/objects/${metadata.sha256}`;bytes=await readFile(objectPath);path=objectPath;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;bytes=await readFile(path);}
 if(metadata.sourceUrl!==source.sourceUrl||createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)throw Error(`Source fingerprint mismatch: ${id}`);
 const proof={...source,sha256:metadata.sha256,receivedAt:metadata.receivedAt,artifactModifiedAt:metadata.lastModified??null,officialPublishedAt:null};
 const rows=source.filename.endsWith('.parquet')?[]:parse(source.filename.endsWith('.gz')?gunzipSync(bytes,{maxOutputLength:128*1024*1024}):bytes,{columns:true,bom:true,skip_empty_lines:true}) as SourceRow[];
 if(rows.length>1000000)throw Error('Source row bound exceeded.');
 return{source,path,metadata,proof,rows};
}
export async function nhlEvents(){const product=await sourceProduct('nhl-events-2027'),file=await asyncBufferFromFile(product.path);const rows=await parquetReadObjects({file,compressors:{GZIP:(bytes,size)=>gunzipSync(bytes,{maxOutputLength:size})},columns:['event_type','event_player_1_type','event_player_1_id','event_player_2_type','event_player_2_id','event_player_3_type','event_player_3_id','event_team_abbr','game_id','event_idx','event_id','period','period_type','period_time','home_score','away_score']});return{...product,rows:rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v==null?'':String(v)]))) as SourceRow[]};}
export const integer=(value:unknown)=>value!==null&&value!==undefined&&/^\d+$/.test(String(value).trim())?Number(value):null;
