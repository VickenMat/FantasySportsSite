import "dotenv/config";
import {readFile}from"node:fs/promises";
import{getDatabase}from"@/lib/db";
import{reconcileHistoricalPositions}from"@/server/historical-position-reconciliation";
const fingerprint="22d4af0837a85bc2f89906d7e480536f7836072f2e20e7d75fc374957e6244f4";
if(process.env.APPROVED_M5_RECOVERY!==fingerprint)throw new Error("Exact approved MLB target invocation required.");
const url=new URL(process.env.DATABASE_URL!);if(url.pathname!=="/fantasy_evolution"||url.searchParams.has("schema"))throw new Error("Unexpected approved development target.");
try{
 const manifest=JSON.parse(await readFile("data/position_enrichment/mlb_review_manifest.json","utf8"));
 const dry=await reconcileHistoricalPositions(manifest);
 if(dry.fingerprint!==fingerprint||dry.changes!==66825||dry.players!==935)throw new Error("Approved target changed. No backfill applied; review a fresh manifest.");
 if(process.argv.includes("--dry-run")){console.log(JSON.stringify(dry));}
 else{const applied=await reconcileHistoricalPositions(manifest,{expectedFingerprint:fingerprint});const repeat=await reconcileHistoricalPositions(manifest);if(repeat.changes!==0)throw new Error("Approved repair replay is not idempotent.");console.log(JSON.stringify({...applied,repeatChanges:repeat.changes}));}
}finally{await getDatabase().$disconnect();}
