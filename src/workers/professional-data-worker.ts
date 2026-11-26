import "dotenv/config";
import{processProfessionalGameFeeds}from"@/ingestion/game-feeds";
import{getDatabase}from"@/lib/db";
let stopped=false,running=false,lastStatus="";
let timer:ReturnType<typeof setInterval>|undefined;
async function tick(){
 if(stopped||running)return;running=true;
 try{const result=await processProfessionalGameFeeds();if(result.status!==lastStatus||result.processed){console.info(JSON.stringify({status:result.status,games:result.processed}));lastStatus=result.status;}}
 catch{console.error("Professional data processing failed; durable leases, cursors and staging support retry.");}
 finally{running=false;if(stopped)await getDatabase().$disconnect();}
}
async function shutdown(){stopped=true;clearInterval(timer);if(!running)await getDatabase().$disconnect();}
process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());
await tick();if(!stopped)timer=setInterval(()=>void tick(),15000);
