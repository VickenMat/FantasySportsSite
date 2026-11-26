"use client";
import { useActionState, useRef, useState } from "react";
import { configureDraftAction } from "@/app/actions/leagues";
import { draftTimeCandidates, draftTimeOptions, draftWallTime } from "@/lib/draft-time";
type Team={id:string;name:string};
type Props={leagueId:string;leagueSportId:string;seasonId:string;sport:string;sports:string[];seasonLabel:string;teams:Team[];enabled:boolean;auctionEnabled:boolean;salaryMode:boolean;universalAvailable:boolean;current:{scope:string;method:string;version:number;order:string[];orderMethod:string;rounds:number;secondsPerPick:number;scheduledAt:string|null;timezone:string}};
export function DraftConfiguration(props:Props){
 const [message,submit,pending]=useActionState(configureDraftAction.bind(null,props.leagueId,props.leagueSportId),"");
 return <DraftConfigurationForm key={props.current.version} {...props} message={message} submit={submit} pending={pending}/>;
}
function DraftConfigurationForm({seasonId,seasonLabel,teams,current,enabled,auctionEnabled,salaryMode,universalAvailable,message,submit,pending}:Props&{message:string;submit:(form:FormData)=>void;pending:boolean}){
 const [orderMethod,setOrderMethod]=useState(current.orderMethod),[order,setOrder]=useState(current.order.length===teams.length&&new Set(current.order).size===teams.length&&current.order.every(id=>teams.some(t=>t.id===id))?current.order:teams.map(t=>t.id));
 const [zone,setZone]=useState(current.timezone), initial=current.scheduledAt?draftWallTime(current.scheduledAt,current.timezone):{date:'',time:''};
 const [date,setDate]=useState(initial.date),[time,setTime]=useState(initial.time),[occurrence,setOccurrence]=useState(String(Math.max(0,draftTimeCandidates(initial.date,initial.time,current.timezone).indexOf(current.scheduledAt??''))));
 const [method,setMethod]=useState(salaryMode?'AUCTION':current.method),[scope]=useState(current.scope),[seconds,setSeconds]=useState(current.secondsPerPick),[rounds,setRounds]=useState(current.rounds);
 const candidates=draftTimeCandidates(date,time,zone),instant=candidates[Number(occurrence)]??candidates[0]??'';
 const dateError=date&&time&&!instant?'This time does not exist in the selected timezone.':instant&&new Date(instant)<=new Date()?'Choose a future draft time.':'';
 const valid=Boolean(date&&time&&instant&&!dateError&&seasonId&&teams.length>=2&&order.length===teams.length&&new Set(order).size===teams.length&&seconds>=15&&seconds<=600&&Number.isInteger(seconds)&&rounds>=1&&rounds<=100&&Number.isInteger(rounds)&&(scope==='SPORT'||universalAvailable)&&(method!=='AUCTION'||auctionEnabled));
 const dragged=useRef<number|null>(null);
 function move(from:number,to:number){if(to<0||to>=order.length)return;setOrder(values=>{const result=[...values];const [item]=result.splice(from,1);result.splice(to,0,item);return result;});}
 const abbreviation=instant?new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'short'}).formatToParts(new Date(instant)).find(p=>p.type==='timeZoneName')?.value:null;
 return <section className="panel"><h2 className="display">Configure initial draft</h2>
 <form action={submit} className="form-grid compact-form"><input type="hidden" name="seasonId" value={seasonId}/><input type="hidden" name="version" value={current.version}/><input type="hidden" name="order" value={JSON.stringify(order)}/><input type="hidden" name="scheduledAt" value={instant}/>
 <input type="hidden" name="scope" value={scope}/>
 <label>Season<input value={seasonLabel} readOnly/></label>
 <label>Draft type<select aria-label="Draft type" name="method" value={method} onChange={e=>setMethod(e.target.value)}><option value="SNAKE" disabled={salaryMode}>Snake</option><option value="AUCTION" disabled={!auctionEnabled}>Auction</option></select>{method==='AUCTION'&&!auctionEnabled&&<small>Configure an auction budget first.</small>}</label>
 <label>Draft Date<input name="draftDate" type="date" required value={date} onChange={e=>setDate(e.target.value)} aria-invalid={Boolean(dateError)}/></label>
 <label>Draft Time<select aria-label="Draft Time" name="draftTime" required value={time} onChange={e=>setTime(e.target.value)} aria-describedby="draft-time-error"><option value="">Select time</option>{!draftTimeOptions.some(o=>o.value===time)&&time&&<option value={time}>{time} (saved)</option>}{draftTimeOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>{dateError&&<small id="draft-time-error" role="alert">{dateError}</small>}</label>
 <label>Timezone<select aria-label="Timezone" name="timezone" value={zone} onChange={e=>setZone(e.target.value)}>{[...new Set(['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','UTC',current.timezone])].map(value=><option key={value} value={value}>{value==='America/New_York'?`Eastern Time (ET)${zone===value&&abbreviation?' · '+abbreviation:''}`:value}</option>)}</select></label>
 {candidates.length>1&&<label>Repeated hour<select aria-label="Repeated hour" name="occurrence" value={occurrence} onChange={e=>setOccurrence(e.target.value)}>{candidates.map((value,i)=><option value={i} key={value}>{new Intl.DateTimeFormat('en-US',{timeZone:zone,timeStyle:'long'}).format(new Date(value))}</option>)}</select></label>}
 <label>Draft timer (seconds)<input name="secondsPerPick" type="number" min="15" max="600" required value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/>{(!Number.isInteger(seconds)||seconds<15||seconds>600)&&<small role="alert">Use 15–600 whole seconds.</small>}</label>
 <label>Draft rounds per franchise<input name="rounds" type="number" min="1" max="100" required value={rounds} onChange={e=>setRounds(Number(e.target.value))}/></label>
 <label>Initial draft order<select aria-label="Initial draft order" name="orderMethod" value={orderMethod} onChange={e=>setOrderMethod(e.target.value)}><option value="RANDOM">Random</option><option value="CUSTOM">Custom</option></select></label>
 <ol aria-label="Initial draft order">{order.map((id,index)=><li key={id} draggable={orderMethod==='CUSTOM'} onDragStart={()=>{dragged.current=index;}} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(orderMethod==='CUSTOM'&&dragged.current!==null)move(dragged.current,index);dragged.current=null;}}>{index+1}. {teams.find(t=>t.id===id)?.name}{orderMethod==='CUSTOM'&&<><button type="button" disabled={index===0} onClick={()=>move(index,index-1)} aria-label={`Move ${teams.find(t=>t.id===id)?.name} up`}>↑</button><button type="button" disabled={index===order.length-1} onClick={()=>move(index,index+1)} aria-label={`Move ${teams.find(t=>t.id===id)?.name} down`}>↓</button></>}</li>)}</ol>
 {!enabled&&<p role="status">Draft scheduling is awaiting database support.</p>}{teams.length<2&&<p role="alert">At least two participating franchises are required.</p>}
 <button className="button primary" disabled={!enabled||pending||!valid}>Save Draft Schedule</button>{orderMethod==='RANDOM'&&<button className="button secondary" name="regenerate" value="true" disabled={!enabled||pending||!valid}>Explicitly regenerate random order</button>}{message&&<p role="status">{message}</p>}
 </form></section>;
}
