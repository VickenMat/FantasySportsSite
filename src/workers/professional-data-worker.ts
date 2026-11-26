import "dotenv/config";
import{processProfessionalGameFeeds}from"@/ingestion/game-feeds";
import{getDatabase}from"@/lib/db";
import{processOpenReleaseFeeds}from'@/ingestion/open-data/scheduler';
let stopped=false,running=false,lastStatus="";
let timer:ReturnType<typeof setInterval>|undefined;
async function stop(){await getDatabase().backgroundJobRun.updateMany({where:{key:'worker:professional-data'},data:{status:'COMPLETE',completedAt:new Date(),result:{heartbeatAt:new Date().toISOString(),stoppedAt:new Date().toISOString()}}});await getDatabase().$disconnect();}
async function tick(){
 if(stopped||running)return;running=true;
 try{const releases=await processOpenReleaseFeeds();const result=await processProfessionalGameFeeds();await getDatabase().backgroundJobRun.upsert({where:{key:'worker:professional-data'},create:{key:'worker:professional-data',jobType:'professional-data',status:'RUNNING',result:{heartbeatAt:new Date().toISOString(),releaseStatus:releases.status,liveStatus:result.status}},update:{status:'RUNNING',completedAt:null,result:{heartbeatAt:new Date().toISOString(),releaseStatus:releases.status,liveStatus:result.status}}});if(result.status!==lastStatus||result.processed||releases.outcomes.length){console.info(JSON.stringify({status:result.status,games:result.processed,releases}));lastStatus=result.status;}}
 catch{console.error("Professional data processing failed; durable leases, cursors and staging support retry.");await getDatabase().backgroundJobRun.updateMany({where:{key:'worker:professional-data'},data:{status:'FAILED',result:{heartbeatAt:new Date().toISOString(),error:'DATA_TICK_FAILED'}}}).catch(()=>undefined);}
 finally{running=false;if(stopped)await stop();}
}
async function shutdown(){stopped=true;clearInterval(timer);if(!running)await stop();}
process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());
await tick();if(!stopped)timer=setInterval(()=>void tick(),15000);
