import { processRecurringCompetition } from '@/ingestion/open-data/recurring-competition';
import "dotenv/config";
import{processProfessionalGameFeeds}from"@/ingestion/game-feeds";
import{getDatabase}from"@/lib/db";
import{processOpenReleaseFeeds}from'@/ingestion/open-data/scheduler';
let stopped=false,running=false,lastStatus="",lastCompetitionSignature="";
let timer:ReturnType<typeof setInterval>|undefined;
async function stop(){await getDatabase().backgroundJobRun.updateMany({where:{key:'worker:professional-data'},data:{status:'COMPLETE',completedAt:new Date(),result:{heartbeatAt:new Date().toISOString(),stoppedAt:new Date().toISOString()}}});await getDatabase().$disconnect();}
async function tick(){
 if(stopped||running)return;running=true;
 try{
  const releases=await processOpenReleaseFeeds(),result=await processProfessionalGameFeeds(),competition=await processRecurringCompetition();
  const signature=JSON.stringify({status:competition.canonicalOperations.status,sports:competition.canonicalOperations.sports.map(row=>({sport:row.sport,status:row.status,lastFailure:row.lastFailure,failures:row.failures,lastAcceptedAt:row.lastAcceptedAt}))});
  const heartbeat={heartbeatAt:new Date().toISOString(),releaseStatus:releases.status,liveStatus:result.status,competitionStatus:competition.canonicalOperations.status,competition:competition.canonicalOperations};
  await getDatabase().backgroundJobRun.upsert({where:{key:'worker:professional-data'},create:{key:'worker:professional-data',jobType:'professional-data',status:'RUNNING',result:heartbeat},update:{status:'RUNNING',completedAt:null,result:heartbeat}});
  if(result.status!==lastStatus||result.processed||releases.outcomes.length||signature!==lastCompetitionSignature||competition.outcomes.some(outcome=>'processed' in outcome&&outcome.processed>0))console.info(JSON.stringify({status:result.status,games:result.processed,releases,competition}));
  lastStatus=result.status;lastCompetitionSignature=signature;
 }
 catch{console.error("Professional data processing failed; durable leases, cursors and staging support retry.");await getDatabase().backgroundJobRun.updateMany({where:{key:'worker:professional-data'},data:{status:'FAILED',result:{heartbeatAt:new Date().toISOString(),error:'DATA_TICK_FAILED'}}}).catch(()=>undefined);}
 finally{running=false;if(stopped)await stop();}
}
async function shutdown(){stopped=true;clearInterval(timer);if(!running)await stop();}
process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());
await tick();if(!stopped)timer=setInterval(()=>void tick(),15000);
