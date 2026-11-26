import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "csv-parse";
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet";
import type { Sport } from "@/generated/prisma/enums";
import { normalizeHistoricalRow, type RawRow } from "@/imports/normalize";
import { parquetSources, startYear } from "@/parquet/config";
import { fingerprint } from "./contracts";

export async function* csvRecords(path:string):AsyncGenerator<RawRow> {
 const source=createReadStream(path);
 const parser=source.pipe(parse({columns:true,bom:true,skip_empty_lines:true,max_record_size:256*1024}));
 try {for await(const record of parser)yield record as RawRow;}finally{source.destroy();parser.destroy();}
}
export function canonicalId(value:unknown) {const s=String(value??"").trim();return /^\d+$/.test(s)?BigInt(s).toString():s;}
export function canonicalValue(value:unknown,column:string,numeric:boolean,boolean=false):unknown {
 if(value==null||value===""||["NaN","NA","N/A","null"].includes(String(value)))return null;
 if(column.toLowerCase().endsWith("id")||column.toLowerCase().endsWith("_id"))return canonicalId(value);
 if(value instanceof Date)return value.toISOString();
 if(boolean){const text=String(value).toLowerCase();if(text==="true")return true;if(text==="false")return false;}
 if(numeric){const n=Number(value);return Number.isFinite(n)?n:String(value);}
 if(Array.isArray(value))return value.map(v=>canonicalValue(v,"",typeof v==="number"));
 if(typeof value==="string"&&/^[\[{]/.test(value)) {try {return JSON.parse(value);}catch {return value;}}
 return String(value);
}
export function archiveKey(row:Record<string,unknown>,sport:Sport) {
 return parquetSources[sport].identityColumns.map(c=>c===parquetSources[sport].seasonColumn?startYear(row[c]):canonicalId(row[c])).join(":");
}
function normalized(row:Record<string,unknown>,sport:Sport) {
 const raw=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v==null?"":typeof v==="object"?JSON.stringify(v):String(v)]));
 try {
  const n=normalizeHistoricalRow(sport,raw,1);
  return fingerprint({key:archiveKey(row,sport),stats:n.stats,role:n.role,phase:n.game.phase,week:n.game.week});
 }catch(error){return `REJECTED:${error instanceof Error?error.message:"invalid"}`;}
}
/** Two independent order-insensitive multisets: common raw values and gameplay-normalized identity/statistics. */
export async function compareRecoveredArchive(sport:Sport,csvPath:string,parquetPath:string,csvNames?:readonly{sourceRecord:number;rawNameSha256:string;value:unknown}[]) {
 const file=await asyncBufferFromFile(parquetPath),meta=await parquetMetadataAsync(file);
 const schema=parquetSchema(meta).children;
 let csvColumns:string[]=[];for await(const row of csvRecords(csvPath)){csvColumns=Object.keys(row);break;}
 const common=schema.map(s=>s.element.name).filter(c=>csvColumns.includes(c)).sort();
 const numeric=new Set(schema.filter(s=>["INT32","INT64","FLOAT","DOUBLE"].includes(String(s.element.type))).map(s=>s.element.name));
 const booleans=new Set(schema.filter(s=>s.element.type==="BOOLEAN").map(s=>s.element.name));
 // NHL's recovered name column is a Python dictionary representation, while
 // Parquet contains a locale-expanded struct. Keep that difference visible.
 const comparable=common.filter(c=>!(sport==="NHL"&&c==="name"&&!csvNames));
 const canonicalName=(value:unknown)=>value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null&&v!=="")):value;
 const rawHash=(row:Record<string,unknown>,name?:unknown)=>fingerprint(comparable.map(c=>[c,sport==="NHL"&&c==="name"?canonicalName(name??row[c]):canonicalValue(row[c],c,numeric.has(c),booleans.has(c))]));
 const rows=new Map<string,number>(),stats=new Map<string,number>();
 let parquetRejected=0;
 for(let offset=0;offset<Number(meta.num_rows);offset+=10000) {
  for(const row of await parquetReadObjects({file,rowStart:offset,rowEnd:Math.min(offset+10000,Number(meta.num_rows))})) {
   const key=`${archiveKey(row,sport)}:${rawHash(row)}`;rows.set(key,(rows.get(key)??0)+1);
   const n=normalized(row,sport);if(n.startsWith("REJECTED:"))parquetRejected++;
   const nk=`${archiveKey(row,sport)}:${n}`;stats.set(nk,(stats.get(nk)??0)+1);
  }
 }
 const consume=(map:Map<string,number>,key:string)=>{const n=map.get(key)??0;if(!n)return false;if(n===1)map.delete(key);else map.set(key,n-1);return true;};
 let csvRows=0,rawMatches=0,normalizedMatches=0,csvRejected=0;const mismatchSamples:{key:string;rawMismatch:boolean;normalizedMismatch:boolean}[]=[];
 for await(const row of csvRecords(csvPath)) {
  csvRows++;const key=archiveKey(row,sport),n=normalized(row,sport);if(n.startsWith("REJECTED:"))csvRejected++;
  const name=csvNames?.[csvRows-1];
  if(csvNames&&(!name||name.sourceRecord!==csvRows+1||name.rawNameSha256!==createHash("sha256").update(String(row.name??"")).digest("hex")))throw new Error("Prepared NHL name values no longer match the immutable source records.");
  const rawMatch=consume(rows,`${key}:${rawHash(row,name?.value)}`),statMatch=consume(stats,`${key}:${n}`);
  if(rawMatch)rawMatches++;if(statMatch)normalizedMatches++;
  if((!rawMatch||!statMatch)&&mismatchSamples.length<20)mismatchSamples.push({key,rawMismatch:!rawMatch,normalizedMismatch:!statMatch});
 }
 const rawRemainder=[...rows.values()].reduce((a,b)=>a+b,0),normalizedRemainder=[...stats.values()].reduce((a,b)=>a+b,0);
 return {sport,csvRows,parquetRows:Number(meta.num_rows),commonColumns:common,excludedRawColumns:common.filter(c=>!comparable.includes(c)),rawComparisonScope:sport==="NHL"?(csvNames?"All shared columns; Python name dictionaries canonicalized and null-only locale expansion ignored; not byte identical":"All shared columns except locale-expanded name struct; not byte/content identical"):"All shared columns",csvOnlyColumns:csvColumns.filter(c=>!schema.some(s=>s.element.name===c)),parquetOnlyColumns:schema.map(s=>s.element.name).filter(c=>!csvColumns.includes(c)),rawMatches,normalizedMatches,csvRejected,parquetRejected,rawUnmatchedCsv:csvRows-rawMatches,rawUnmatchedParquet:rawRemainder,normalizedUnmatchedCsv:csvRows-normalizedMatches,normalizedUnmatchedParquet:normalizedRemainder,mismatchSamples};
}
