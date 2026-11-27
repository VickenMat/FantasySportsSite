import type {Sport} from '@/generated/prisma/enums';
/** Offline ownership only. No production database, financial or roster writes. */
export class SharedSimulationRoster {
 private owners=new Map<string,{team:number;sport:Sport;ir:boolean}>();
 constructor(readonly teams:number,readonly starters:Readonly<Record<Sport,number>>,readonly sportBench=5,readonly universalBench=5,readonly universalIr=5){if(!Number.isInteger(teams)||teams<4||teams>16)throw Error('Simulation supports four through sixteen franchises.');}
 private key(sport:Sport,id:string){return JSON.stringify([sport,id]);}
 private validate(rows:typeof this.owners){for(let team=0;team<this.teams;team++){const owned=[...rows.values()].filter(row=>row.team===team),ir=owned.filter(row=>row.ir).length;const overflow=(Object.keys(this.starters) as Sport[]).reduce((sum,sport)=>sum+Math.max(0,owned.filter(row=>row.sport===sport&&!row.ir).length-this.starters[sport]-this.sportBench),0);if(ir>this.universalIr||overflow>this.universalBench)throw Error('Shared bench/IR capacity exceeded.');}}
 acquire(team:number,sport:Sport,id:string){this.replace(team,sport,id,null);}
 acquireIr(team:number,sport:Sport,id:string,knownEligible:boolean){if(!knownEligible)throw Error("IR requires explicit eligible evidence.");this.replace(team,sport,id,null,true);}
 replace(team:number,sport:Sport,add:string,drop:string|null,ir=false){if(!Number.isInteger(team)||team<0||team>=this.teams)throw Error('Unknown franchise.');const next=new Map(this.owners),key=this.key(sport,add);if(next.has(key))throw Error('Duplicate athlete ownership.');if(drop){const old=this.key(sport,drop);if(next.get(old)?.team!==team)throw Error('Drop requires existing ownership.');next.delete(old);}next.set(key,{team,sport,ir});this.validate(next);this.owners=next;}
 moveIr(team:number,sport:Sport,id:string,ir:boolean,knownEligible:boolean){const key=this.key(sport,id),row=this.owners.get(key);if(!row||row.team!==team||ir&&!knownEligible)throw Error('IR requires ownership and explicit eligible evidence.');const next=new Map(this.owners);next.set(key,{...row,ir});this.validate(next);this.owners=next;}
 isIr(sport:Sport,id:string){return this.owners.get(this.key(sport,id))?.ir??false;}
 snapshot(){return [...this.owners.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,row])=>({key,...row}));}
}
