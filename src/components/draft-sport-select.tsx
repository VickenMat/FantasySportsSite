"use client";
import {useRouter} from 'next/navigation';
export function DraftSportSelect({leagueId,sports,selected,primarySport,universal}:{leagueId:string;sports:string[];selected:string;primarySport:string;universal:boolean}){
 const router=useRouter();
 return <label className="draft-sport-select">Sport<select aria-label="Sport" value={selected} onChange={event=>{const value=event.target.value;if(value==='UNIVERSAL'&&universal)router.push(`/leagues/${leagueId}/draft?sport=${primarySport}&scope=UNIVERSAL`);else if(sports.includes(value))router.push(`/leagues/${leagueId}/draft?sport=${value}`);}}>{sports.map(sport=><option value={sport} key={sport}>{sport}</option>)}{universal&&<option value="UNIVERSAL">Universal</option>}</select></label>;
}
