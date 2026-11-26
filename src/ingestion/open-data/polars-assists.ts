/** Decode only the publisher's bounded Polars struct-list display; never evaluate source text. */
export function scoringAssistIds(raw:string):string[]|null{
 let value=raw;try{if(value.startsWith('"'))value=JSON.parse(value);}catch{return null;}
 if(typeof value!=='string'||value.length>16000)return null;
 const header=/^shape: \((\d+),\)\s+Series: '' \[struct\[6\]\]\s+\[/.exec(value);if(!header||Number(header[1])>2)return null;
 const body=value.slice(header[0].length).trim();if(!body.endsWith(']'))return null;
 const text=body.slice(0,-1).trim(),ids:string[]=[];let depth=0,quoted=false,escaped=false,start=-1;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if(c==='{'){if(depth++===0)start=i+1;if(depth>8)return null;}else if(c==='}'){if(--depth<0)return null;if(depth===0){const row=text.slice(start,i);let inner=0,q=false,escape=false,fields=1;for(const ch of row){if(q){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')q=false;continue;}if(ch==='"')q=true;else if(ch==='{')inner++;else if(ch==='}')inner--;else if(ch===','&&inner===0)fields++;}const id=/^(\d{5,10}),/.exec(row)?.[1];if(!id||fields!==6)return null;ids.push(id);}}else if(depth===0&&!/[\s,]/.test(c))return null;}
 return !quoted&&depth===0&&ids.length===Number(header[1])&&new Set(ids).size===ids.length?ids:null;
}
