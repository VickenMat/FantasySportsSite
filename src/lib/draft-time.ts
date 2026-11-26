/** Wall-clock conversion validates round trips, including DST gaps and repeated hours. */
export function draftWallTime(instant: string, zone: string) {
 const parts = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
export function draftTimeCandidates(date:string,time:string,zone:string):string[] {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return [];
 const nominal=Date.parse(`${date}T${time}:00Z`);if(!Number.isFinite(nominal))return [];
 try {
  const offsets=new Set<number>();
  for(const hours of [-36,-12,0,12,36]) {const sample=nominal+hours*3600000;const wall=draftWallTime(new Date(sample).toISOString(),zone);offsets.add(Date.parse(`${wall.date}T${wall.time}:00Z`)-sample);}
  return [...offsets].map(offset=>new Date(nominal-offset).toISOString()).filter(instant=>{const wall=draftWallTime(instant,zone);return wall.date===date&&wall.time===time;}).sort();
 }catch{return [];}
}
export const draftTimeOptions=Array.from({length:96},(_,i)=>{const hour=Math.floor(i/4),minute=(i%4)*15;return {value:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,label:`${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`};});
