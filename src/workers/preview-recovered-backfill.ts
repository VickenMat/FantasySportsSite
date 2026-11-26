import "dotenv/config";
import {readFile,writeFile} from "node:fs/promises";
import {getDatabase} from "@/lib/db";
import {reconcileHistoricalPositions,type historicalPositionRepairSchema} from "@/server/historical-position-reconciliation";
import type {z} from "zod";
import {fingerprint} from "@/ingestion/contracts";
const directory="data/position_enrichment";
const recovered=JSON.parse(await readFile(`${directory}/mlb_recorded_threshold_candidates.json`,"utf8")) as {sourceFingerprint:string;rows:{playerExternalId:string;seasonStartYear:number;positions:string[];status:string;sourceReferences:string[]}[]};
const contextPath=`${directory}/generation_context.json`;
let context:{sourceFingerprint:string;knownAt:string};
try{context=JSON.parse(await readFile(contextPath,"utf8"));if(context.sourceFingerprint!==recovered.sourceFingerprint)throw new Error("Source fingerprint changed; review a new generation context.");}
catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;context={sourceFingerprint:recovered.sourceFingerprint,knownAt:new Date().toISOString()};await writeFile(contextPath,JSON.stringify(context,null,2)+"\n");}
const db=getDatabase();
try {
 const imported=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  return tx.playerExternalId.findMany({
   where:{sport:"MLB",provider:"v9-historical",player:{isSynthetic:false}},
   select:{externalId:true,player:{select:{gameStats:{
    where:{provider:"v9-historical"},select:{game:{select:{season:{select:{startYear:true}}}}}
   }}}}
  });
 });
 const existing=new Set(imported.flatMap(p=>p.player.gameStats.map(s=>`${p.externalId}:${s.game.season.startYear}`)));
 const candidates=recovered.rows.filter(r=>existing.has(`${r.playerExternalId}:${r.seasonStartYear}`));
 const rows=candidates.filter(r=>r.status==="RECORDED_THRESHOLD_SUPPORTED").map(r=>({playerExternalId:r.playerExternalId,identityProvider:"v9-historical",seasonStartYear:r.seasonStartYear,positions:r.positions,verificationStatus:"VERIFIED" as const,sourceReference:`recovered:${recovered.sourceFingerprint}; ${r.sourceReferences.join(" ; ")}`,knownAt:context.knownAt}));
 const manifest:z.input<typeof historicalPositionRepairSchema>={sport:"MLB",sourceName:"recovered-mlb-recorded-thresholds",sourceProvider:"recovered-mlb-position-evidence",rows};
 await writeFile(`${directory}/mlb_review_manifest.json`,JSON.stringify(manifest,null,2)+"\n");
 const dry=rows.length?await reconcileHistoricalPositions(manifest):{changes:0,players:0,applied:false,fingerprint:null};
 const report={...dry,manifestFingerprint:fingerprint(manifest),candidateImportedPlayerSeasons:candidates.length,manifestRows:rows.length,withheldPlayerSeasons:candidates.length-rows.length,knownAtMeaning:"Recovery analysis observation only; original official publication timestamps are preserved.",developmentWrites:0};
 await writeFile(`${directory}/mlb_backfill_preview.json`,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}finally{await db.$disconnect();}
