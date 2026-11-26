"use client";
import{useEffect,useState}from"react";
import{useRouter}from"next/navigation";
export function DataFreshnessClock({scoredAt}:{scoredAt:string}){
 const [now,setNow]=useState<number|null>(null),router=useRouter();
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},15000);return()=>clearInterval(timer);},[router]);
 const age=now===null?null:now-Date.parse(scoredAt);
 return <p className="muted">Displayed score age: {age===null||age<0?"unknown":age<60000?`${Math.floor(age/1000)}s`:age<3600000?`${Math.floor(age/60000)}m`:`${Math.floor(age/3600000)}h`}. Updates refresh while this page is visible.</p>;
}
