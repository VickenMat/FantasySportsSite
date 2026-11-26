import "dotenv/config";
import {randomInt} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll,expect,it}from"vitest";
import{getDatabase}from"@/lib/db";
import{importHistoricalCsv}from"@/imports/persist";
import{recalculateScore}from"@/server/score-ledger";
import{nbaRow,writeHistoricalCsv}from"../helpers/historical-csv";
const db=getDatabase();afterAll(()=>db.$disconnect());
it("retains one canonical V9 ledger and fixed role across explicitly reviewed source changes and replay",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"source-aware-v9-"));
 try{
  const externalId=String(randomInt(10000000,99000000));
  const path=await writeHistoricalCsv(join(dir,"fixture.csv"),[{...nbaRow,PLAYER_ID:externalId,GAME_ID:String(randomInt(100000000,999000000))}]);
  await importHistoricalCsv({path,sport:"NBA"});
  const identity=await db.playerExternalId.findUniqueOrThrow({where:{sport_provider_externalId:{sport:"NBA",provider:"v9-historical",externalId}}});
  const stat=await db.playerGameStat.findFirstOrThrow({where:{playerId:identity.playerId}});
  const input={gameId:stat.gameId,playerId:stat.playerId,reason:"Isolated source arbitration fixture"};
  const original=await recalculateScore(input);
  const {id:_id,recordedAt:_recorded,...copy}=stat;void _id;void _recorded;
  const alternative=await db.playerGameStat.create({data:{...copy,provider:"synthetic-approved-source",revision:1,priorRevisionId:null,contentHash:"synthetic-authoritative-revision",normalized:{...(stat.normalized as Record<string,number|null>),PTS:40},raw:{synthetic:true}}});
  await expect(recalculateScore({...input,sourceProvider:alternative.provider})).rejects.toThrow(/source change reason/);
  const changed=await recalculateScore({...input,sourceProvider:alternative.provider,sourceChangeReason:"Synthetic evidence priority review"});
  if(!changed.ledger||!original.ledger)throw new Error("Expected canonical ledgers");
  expect(changed.ledger.id).toBe(original.ledger.id);expect(changed.entry.statId).toBe(alternative.id);
  expect((await recalculateScore(input)).changed).toBe(false);
  await expect(recalculateScore({...input,role:"PITCHER"})).rejects.toThrow(/role is already fixed/);
  await expect(recalculateScore({...input,sourceProvider:"unknown-source",sourceChangeReason:"Missing source fixture"})).rejects.toThrow(/no box score/);
  expect(await db.scoreLedger.count({where:{playerId:stat.playerId,gameId:stat.gameId}})).toBe(1);
  expect(await db.scoreLedgerEntry.count({where:{ledgerId:changed.ledger.id}})).toBe(2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
