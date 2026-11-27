import {fingerprint} from '@/ingestion/contracts';
import {simulationV9Fingerprint} from '../scoring';
/** Baseline promotion consumes explicit reviewed evidence, not a CLI label. */
export function requireAcceptedCycle(manifest:{version:string;methodologyFingerprint:string;scoringFingerprint:string;cycles:{year:number;independentInventory:boolean;completionChronology:boolean;positions:boolean;discovery:boolean;statisticalUncertaintyAccepted:boolean;sourceHashes:Record<string,string>}[];fingerprint:string},year:number,methodologyFingerprint:string){
 const {fingerprint:claimed,...body}=manifest;
 if(claimed!==fingerprint(body))throw Error('Accepted cohort manifest fingerprint differs.');
 if(manifest.version!=='m61-reviewed-comparable-cycles-1'||manifest.methodologyFingerprint!==methodologyFingerprint||manifest.scoringFingerprint!==simulationV9Fingerprint)throw Error('Methodology/scoring acceptance differs.');
 const cycle=manifest.cycles.find(c=>c.year===year);
 if(!cycle||!cycle.independentInventory||!cycle.completionChronology||!cycle.positions||!cycle.discovery||!cycle.statisticalUncertaintyAccepted||Object.keys(cycle.sourceHashes).length!==4)throw Error('No accepted comparable four-sport cycle.');
 return cycle;
}
