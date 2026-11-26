import { playerPage } from "./draft";
import { getDatabase } from '@/lib/db';
import { playerStatistics, type PlayerStatistics } from "./player-statistics";
import { slotRule } from '@/simulation/config';
import type { Sport } from '@/generated/prisma/enums';
export function startablePositions(sport:Sport,slots:readonly string[]){return [...new Set(slots.flatMap(slot=>slotRule(sport,slot)?.positions??[]))];}
/** Unknown projections stay null. Roster percentage uses actual franchise ownership in this league. */
export async function browsePlayers(leagueId:string,options:NonNullable<Parameters<typeof playerPage>[1]>&{presetId:string;seasonId:string;asOf?:Date;sort?:string;points?:string}){
 const pool=await playerPage(leagueId,{...options,allResults:true});
 const statistics=new Map<string,PlayerStatistics>();
 for(let offset=0;offset<pool.items.length;offset+=250){const values=await playerStatistics({playerIds:pool.items.slice(offset,offset+250).map(p=>p.id),presetId:options.presetId,seasonId:options.seasonId,asOf:options.asOf});for(const [id,value]of values)statistics.set(id,value);}
 const db=getDatabase();const [franchises,ownership]=await Promise.all([db.fantasyTeam.count({where:{leagueId}}),db.rosterEntry.findMany({where:{leagueId,sport:pool.sport,releasedAt:null},select:{playerId:true}})]);
 const owned=new Set(ownership.map(r=>r.playerId));
 const rosterPercent=new Map(pool.items.map(p=>[p.id,franchises>0?(owned.has(p.id)?100/franchises:0):null]));
 const projections=new Map(pool.items.map(p=>[p.id,null as number|null]));
 const filtered=pool.items.filter(p=>options.points==='KNOWN'?statistics.get(p.id)?.totalTenths!=null:options.points==='UNKNOWN'?statistics.get(p.id)?.totalTenths==null:true);
 const desc=(a:bigint|number|null|undefined,b:bigint|number|null|undefined)=>a==null?b==null?0:1:b==null?-1:a===b?0:a>b?-1:1;
 filtered.sort((a,b)=>{
  const primary=options.sort==='NAME'?a.displayName.localeCompare(b.displayName):options.sort==='AVG'?desc(statistics.get(a.id)?.averageTenths,statistics.get(b.id)?.averageTenths):options.sort==='GP'?desc(statistics.get(a.id)?.gamesPlayed,statistics.get(b.id)?.gamesPlayed):options.sort==='PTS'?desc(statistics.get(a.id)?.totalTenths,statistics.get(b.id)?.totalTenths):0;
  return primary||desc(projections.get(a.id),projections.get(b.id))||desc(rosterPercent.get(a.id),rosterPercent.get(b.id))||desc(statistics.get(a.id)?.totalTenths,statistics.get(b.id)?.totalTenths)||a.id.localeCompare(b.id);
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pool.pageSize)),page=Math.min(pool.page,pages);
 return {...pool,page,pages,total:filtered.length,statistics,rosterPercent,projections,rosterPercentageDenominator:franchises,items:filtered.slice((page-1)*pool.pageSize,page*pool.pageSize)};
}
