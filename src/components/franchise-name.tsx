"use client";
import { useActionState,useState } from 'react';
import { renameTeamAction } from '@/app/actions/leagues';
export function FranchiseName({leagueId,name}:{leagueId:string;name:string}){
 const [editing,setEditing]=useState(false),[displayed,setDisplayed]=useState(name);
 const [message,action,pending]=useActionState(async(_state:string,form:FormData)=>{try{await renameTeamAction(leagueId,form);setDisplayed(String(form.get('name')).trim());setEditing(false);return '';}catch(error){return error instanceof Error?error.message:'Name could not be saved.';}},'');
 return editing?<form action={action} className="inline-form"><label>Franchise name<input name="name" defaultValue={displayed} required maxLength={80} autoFocus/></label><button className="button compact primary" disabled={pending}>Save name</button><button type="button" className="button compact secondary" onClick={()=>setEditing(false)}>Cancel</button>{message&&<p role="alert">{message}</p>}</form>:<div className="franchise-title"><h1 className="display">{displayed}</h1><button type="button" className="icon-button" aria-label="Edit franchise name" onClick={()=>setEditing(true)}>✎</button></div>;
}
