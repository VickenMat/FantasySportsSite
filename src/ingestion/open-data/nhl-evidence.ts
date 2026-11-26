import{integer,type SourceRow}from'./read';
import{scoringAssistIds}from'./polars-assists';
/** Complete event streams prove known zero; percentages only cross-check exact event counts. */
export function reconcileNhlEvents(skaters:SourceRow[],events:SourceRow[],scoring:SourceRow[],info:SourceRow[]){
 const games=new Map<string,{skaters:SourceRow[];events:SourceRow[];goals:SourceRow[];info:SourceRow|null}>();
 const game=(id:string)=>{if(!games.has(id))games.set(id,{skaters:[],events:[],goals:[],info:null});return games.get(id)!;};
 for(const row of skaters)game(row.game_id).skaters.push(row);for(const row of events)game(row.game_id).events.push(row);for(const row of scoring)game(row.game_id).goals.push(row);for(const row of info)game(row.game_id).info=row;
 const accepted=new Map<string,{faceoff_wins:number;shorthanded_points_bonus:number;faceoffEvents:string[];shortGoalEvents:string[]}>(),rejected:{gameId:string;reasons:string[]}[]=[];
 for(const [gameId,g]of games){
  const reasons:string[]=[],end=g.events.filter(e=>e.event_type==='GAME_END');
  if(g.info?.game_state!=='OFF'||end.length!==1)reasons.push('FINAL_STREAM_NOT_PROVEN');
  if(g.events.filter(e=>e.event_type==='FACEOFF').length<3)reasons.push('FACEOFF_STREAM_INCOMPLETE');
  if(end.length===1&&(integer(end[0].home_score)!==integer(g.info?.home_score)||integer(end[0].away_score)!==integer(g.info?.away_score)))reasons.push('FINAL_SCORE_MISMATCH');
  const players=new Map(g.skaters.map(p=>[p.player_id,p]));if(players.size!==g.skaters.length||players.size<30)reasons.push('INCOMPLETE_OR_DUPLICATE_SKATER_BOX');
  const counts=new Map([...players.keys()].map(id=>[id,{wins:0,losses:0,goals:0,assists:0,short:0,faceoffEvents:[] as string[],shortGoalEvents:[] as string[]}]));
  const scoringKey=(r:SourceRow)=>`${r.playerId}:${r.period_number}:${r.timeInPeriod}`;
  const scoreKeys=new Map<string,SourceRow[]>();for(const row of g.goals){const key=scoringKey(row);scoreKeys.set(key,[...(scoreKeys.get(key)??[]),row]);}
  const seen=new Set<string>(),matchedGoals=new Set<string>();
  for(const event of g.events){
   const key=event.event_idx||event.event_id;if(seen.has(key)){reasons.push('DUPLICATE_EVENT');continue;}seen.add(key);
   if(event.event_type==='FACEOFF'){
    const winner=counts.get(event.event_player_1_id),loser=counts.get(event.event_player_2_id);
    if(event.event_player_1_type!=='Winner'||event.event_player_2_type!=='Loser'||!winner||!loser||event.event_player_1_id===event.event_player_2_id||players.get(event.event_player_1_id)?.team_id===players.get(event.event_player_2_id)?.team_id){reasons.push('UNRESOLVED_FACEOFF_ACTORS');continue;}
    winner.wins++;winner.faceoffEvents.push(key);loser.losses++;
   }
   if(event.event_type==='GOAL'&&event.period_type!=='SHOOTOUT'){
    const keyGoal=`${event.event_player_1_id}:${event.period}:${event.period_time}`,references=scoreKeys.get(keyGoal);
    if(event.event_player_1_type!=='Scorer'||references?.length!==1||matchedGoals.has(keyGoal)||!['ev','pp','sh'].includes(references[0].strength)){reasons.push('GOAL_STRENGTH_OR_IDENTITY_UNRESOLVED');continue;}
    matchedGoals.add(keyGoal);

   }
  }
  // Scoring-play credits, cross-checked against the complete box, supersede stale PBP assists.
  for(const goal of g.goals){const assists=scoringAssistIds(goal.assists),scorer=counts.get(goal.playerId);if(!scorer||assists===null||assists.some(id=>!counts.has(id))){reasons.push('UNRESOLVED_SCORING_CREDIT');continue;}scorer.goals++;for(const id of assists)counts.get(id)!.assists++;if(goal.strength==='sh')for(const id of [goal.playerId,...assists]){const count=counts.get(id)!;count.short++;count.shortGoalEvents.push(goal.eventId);}}
  if(matchedGoals.size!==g.goals.length)reasons.push('SCORING_STREAM_INCOMPLETE');
  for(const [id,count]of counts){const box=players.get(id)!;if(count.goals!==integer(box.goals)||count.assists!==integer(box.assists))reasons.push('BOX_EVENT_TOTAL_MISMATCH');const pct=Number(box.faceoff_winning_pctg);if(count.wins+count.losses>0&&(!Number.isFinite(pct)||Math.abs(count.wins/(count.wins+count.losses)-pct)>.0051))reasons.push('FACEOFF_PERCENT_VALIDATION_MISMATCH');}
  if(reasons.length){rejected.push({gameId,reasons:[...new Set(reasons)]});continue;}
  for(const [playerId,count]of counts)accepted.set(`${gameId}:${playerId}`,{faceoff_wins:count.wins,shorthanded_points_bonus:count.short,faceoffEvents:count.faceoffEvents,shortGoalEvents:count.shortGoalEvents});
 }
 return{accepted,rejected,games:games.size};
}
