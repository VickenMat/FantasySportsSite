import{integer,type SourceRow}from'./read';
import{scoringAssistIds}from'./polars-assists';
import{nhlFinalScoreMatches}from'./nhl-final-score';
/** Complete event streams prove known zero; percentages only cross-check exact event counts. */
export function reconcileNhlEvents(skaters:SourceRow[],events:SourceRow[],scoring:SourceRow[],info:SourceRow[],goalies:SourceRow[]=[]){
 const games=new Map<string,{skaters:SourceRow[];goalies:SourceRow[];events:SourceRow[];goals:SourceRow[];info:SourceRow|null}>();
 const game=(id:string)=>{if(!games.has(id))games.set(id,{skaters:[],goalies:[],events:[],goals:[],info:null});return games.get(id)!;};
 for(const row of skaters)game(row.game_id).skaters.push(row);for(const row of events)game(row.game_id).events.push(row);for(const row of scoring)game(row.game_id).goals.push(row);for(const row of info)game(row.game_id).info=row;
 for(const row of goalies)game(row.game_id).goalies.push(row);
 const accepted=new Map<string,{faceoff_wins:number;shorthanded_points_bonus:number;faceoffEvents:string[];shortGoalEvents:string[]}>(),rejected:{gameId:string;reasons:string[]}[]=[];
 const goalieScoringCredits=new Map<string,{goals:number;goalEvents:string[]}>();
 for(const [gameId,g]of games){
  const reasons:string[]=[],end=g.events.filter(e=>e.event_type==='GAME_END');
  if(g.info?.game_state!=='OFF'||end.length!==1)reasons.push('FINAL_STREAM_NOT_PROVEN');
  if(g.events.filter(e=>e.event_type==='FACEOFF').length<3)reasons.push('FACEOFF_STREAM_INCOMPLETE');
  if(end.length===1&&!nhlFinalScoreMatches(end[0],g.info))reasons.push('FINAL_SCORE_MISMATCH');
  const players=new Map(g.skaters.map(p=>[p.player_id,p]));if(players.size!==g.skaters.length||players.size<30)reasons.push('INCOMPLETE_OR_DUPLICATE_SKATER_BOX');
  const goalieActors=new Map(g.goalies.map(p=>[p.player_id,p])),teams=new Set(g.skaters.map(p=>p.team_id));
  if(goalieActors.size!==g.goalies.length||g.goalies.some(p=>players.has(p.player_id)||!teams.has(p.team_id)))reasons.push('DUPLICATE_OR_CONFLICTING_GOALIE_ACTOR');
  const validGoalieActor=(id:string)=>{const row=goalieActors.get(id),time=row?.toi?.match(/^(\d+):([0-5]\d)$/);return row&&time&&60*Number(time[1])+Number(time[2])>0?row:undefined;};
  const counts=new Map([...players.keys()].map(id=>[id,{wins:0,losses:0,goals:0,assists:0,short:0,faceoffEvents:[] as string[],shortGoalEvents:[] as string[]}]));
  const shootoutPeriods=new Set(g.events.filter(event=>event.period_type==='SHOOTOUT').map(event=>event.period));
  const statisticalGoals=g.goals.filter(goal=>!shootoutPeriods.has(goal.period_number));
  const shootoutGoals=g.goals.filter(goal=>shootoutPeriods.has(goal.period_number));
  if(shootoutPeriods.size&&(end.length!==1||end[0].period_type!=='SHOOTOUT'||shootoutGoals.length!==1||scoringAssistIds(shootoutGoals[0]?.assists??'')?.length!==0))reasons.push('SHOOTOUT_STREAM_UNRESOLVED');
  if(shootoutGoals.length===1){const goal=shootoutGoals[0],player=players.get(goal.playerId),winner=integer(g.info?.home_score)!>integer(g.info?.away_score)!?g.info?.home_team_abbr:g.info?.away_team_abbr;if(!player||player.team_abbrev!==winner||!g.events.some(event=>event.event_type==='GOAL'&&event.period_type==='SHOOTOUT'&&event.event_player_1_type==='Scorer'&&event.event_player_1_id===goal.playerId))reasons.push('SHOOTOUT_SCORER_UNRESOLVED');}
  if(end.length===1){const home=integer(end[0].home_score),away=integer(end[0].away_score);if(home===null||away===null||statisticalGoals.length!==home+away)reasons.push('GOAL_STREAM_SCORE_TOTAL_MISMATCH');}
  const scoringKey=(r:SourceRow)=>`${r.playerId}:${r.period_number}:${r.timeInPeriod}`;
  const scoreKeys=new Map<string,SourceRow[]>();for(const row of statisticalGoals){const key=scoringKey(row);scoreKeys.set(key,[...(scoreKeys.get(key)??[]),row]);}
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
  const goalieGoals=new Map<string,{goals:number;goalEvents:string[]}>();
  for(const goal of statisticalGoals){const assists=scoringAssistIds(goal.assists),scorer=counts.get(goal.playerId),scorerActor=players.get(goal.playerId)??validGoalieActor(goal.playerId);if(!scorerActor||assists===null||assists.includes(goal.playerId)||assists.some(id=>{const actor=players.get(id)??validGoalieActor(id);return !actor||actor.team_id!==scorerActor.team_id;})){reasons.push('UNRESOLVED_SCORING_CREDIT');continue;}if(scorer)scorer.goals++;else{const credit=goalieGoals.get(goal.playerId)??{goals:0,goalEvents:[]};credit.goals++;credit.goalEvents.push(goal.eventId);goalieGoals.set(goal.playerId,credit);}for(const id of assists){const count=counts.get(id);if(count)count.assists++;}if(goal.strength==='sh')for(const id of [goal.playerId,...assists]){const count=counts.get(id);if(count){count.short++;count.shortGoalEvents.push(goal.eventId);}}}
  if(matchedGoals.size!==statisticalGoals.length)reasons.push('SCORING_STREAM_INCOMPLETE');
  for(const [id,count]of counts){const box=players.get(id)!;if(count.goals!==integer(box.goals)||count.assists!==integer(box.assists))reasons.push('BOX_EVENT_TOTAL_MISMATCH');const pct=Number(box.faceoff_winning_pctg);if(count.wins+count.losses===0&&pct>0)reasons.push('FACEOFF_EVENT_STREAM_INCOMPLETE');if(count.wins+count.losses>0&&(!Number.isFinite(pct)||Math.abs(count.wins/(count.wins+count.losses)-pct)>.0051))reasons.push('FACEOFF_PERCENT_VALIDATION_MISMATCH');}
  if(reasons.length){rejected.push({gameId,reasons:[...new Set(reasons)]});continue;}
  for(const [playerId,count]of counts)accepted.set(`${gameId}:${playerId}`,{faceoff_wins:count.wins,shorthanded_points_bonus:count.short,faceoffEvents:count.faceoffEvents,shortGoalEvents:count.shortGoalEvents});
  for(const [playerId,credit]of goalieGoals)goalieScoringCredits.set(`${gameId}:${playerId}`,credit);
 }
 return{accepted,rejected,games:games.size,goalieScoringCredits};
}
