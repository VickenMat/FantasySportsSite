/** Explicit offline four-sport run. No inferred chronology or official approval. */
import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{execFileSync}from'node:child_process';
import{resolve,dirname}from'node:path';
import{z}from'zod';
import{parseSnapshot}from'@/simulation/snapshot';
import{runSimulationCycle}from'@/simulation/cycle';
import{seasonDiagnostics}from'@/simulation/diagnostics';
import{simulationV9Fingerprint}from'@/simulation/scoring';
const config=z.object({version:z.literal('m6-four-sport-snapshot-selection-1'),classification:z.enum(['FIXTURE','DIAGNOSTIC','OFFICIAL']),rankingModel:z.enum(['TRAILING20_SHRINK4','V5_TRAILING10_PRIOR_FALLBACK','PRIOR_SEASON_ONLY']).default('TRAILING20_SHRINK4'),teams:z.number().int().min(4).max(16).default(12),seed:z.number().int().nonnegative(),sharedBenchAllocation:z.object({NFL:z.number().int().min(0),MLB:z.number().int().min(0),NBA:z.number().int().min(0),NHL:z.number().int().min(0)}),sources:z.array(z.object({sport:z.enum(['NFL','MLB','NBA','NHL']),snapshot:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).length(4),assumptions:z.array(z.string())});
const [manifestPath,outputPath]=process.argv.slice(2);if(!manifestPath||!outputPath)throw Error('Provide a hash-bound four-sport selection manifest and a new output path.');
const raw=await readFile(manifestPath,'utf8'),manifest=config.parse(JSON.parse(raw));if(manifest.classification==='OFFICIAL')throw Error('No official M6 methodology/dataset is approved. Review docs/M6_UNRESOLVED_DECISIONS.md; no simulation ran.');
const inputs=await Promise.all(manifest.sources.map(async source=>{const bytes=await readFile(resolve(dirname(manifestPath),source.snapshot));if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Immutable snapshot fingerprint differs.');const snapshot=parseSnapshot(bytes.toString());if(snapshot.sport!==source.sport)throw Error('Snapshot sport differs.');return snapshot;}));
const start=performance.now(),result=runSimulationCycle(inputs,{teams:manifest.teams,seed:manifest.seed,rankingModel:manifest.rankingModel,classification:manifest.classification,sharedBenchAllocation:manifest.sharedBenchAllocation,profile:true});
const output={gitCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),selectionSha256:createHash('sha256').update(raw).digest('hex'),scoringConfigurationFingerprint:simulationV9Fingerprint,assumptions:manifest.assumptions,elapsedMs:performance.now()-start,result,diagnostics:result.runs.map(seasonDiagnostics),officialBaseline:false,productionWrites:0};await writeFile(outputPath,JSON.stringify(output)+'\n',{flag:'wx'});console.log(JSON.stringify({classification:manifest.classification,fingerprint:result.fingerprint,output:outputPath}));
