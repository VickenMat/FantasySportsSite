import type { Sport } from '@/generated/prisma/enums';
type Rule={sport:Sport;statKey:string;coefficient:number};
export function scoringComparisons(rules:Rule[],sports:readonly Sport[]){
 const weight=(sport:Sport,key:string)=>rules.find(r=>r.sport===sport&&r.statKey===key)?.coefficient;
 const pairs:[Sport,string,string,Sport,string,string][]=[['NFL','rushing_tds','Rushing touchdown weight','NBA','PTS','NBA point weight'],['MLB','homeRuns','Home-run bonus weight','NHL','goals','NHL goal weight'],['NFL','receptions','Reception weight','NBA','AST','NBA assist weight'],['MLB','pitching_strikeOuts','Pitching strikeout weight','NHL','sog','NHL shot-on-goal weight']];
 const results=pairs.flatMap(([a,keyA,labelA,b,keyB,labelB])=>{const x=weight(a,keyA),y=weight(b,keyB);return sports.includes(a)&&sports.includes(b)&&x!==undefined&&y!==undefined&&Number.isFinite(x)&&Number.isFinite(y)&&x>0&&y>0?[{label:`${labelA} (${x.toFixed(1)}) = ${(x/y).toFixed(2)} × ${labelB.toLowerCase()} (${y.toFixed(1)})`,kind:'Standalone weights'}]:[];});
 const basket=['PTS','FGM','FGA'].map(key=>weight('NBA',key)),homer=['homeRuns','hits','atBats'].map(key=>weight('MLB',key));
 if(sports.includes('NBA')&&sports.includes('MLB')&&basket.every(v=>v!==undefined)&&homer.every(v=>v!==undefined)){
  const basketTotal=2*basket[0]!+basket[1]!+basket[2]!,homerTotal=homer.reduce((sum,v)=>sum+v!,0);
  if(basketTotal>0&&homerTotal>0)results.push({label:`One MLB home run (${homerTotal.toFixed(1)}: home-run bonus + hit + at-bat) = ${(homerTotal/basketTotal).toFixed(2)} made NBA two-point baskets (${basketTotal.toFixed(1)}: 2 points + made field goal + attempt). Other events excluded.`,kind:'Composite events'});
 }
 return results;
}
