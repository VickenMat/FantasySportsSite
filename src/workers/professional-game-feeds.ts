import "dotenv/config";
import{processProfessionalGameFeeds}from"@/ingestion/game-feeds";
import{getDatabase}from"@/lib/db";
try{console.log(JSON.stringify(await processProfessionalGameFeeds(),(_,value)=>typeof value==="bigint"?value.toString():value));}finally{await getDatabase().$disconnect();}
