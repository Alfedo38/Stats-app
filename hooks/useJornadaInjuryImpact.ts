'use client';
import {useEffect,useRef,useState} from 'react';
import {automaticImpactRequest,impactPlayerKey,matchingImpactReport,type AutoImpactRequest,type AutoImpactReport,type AutoImpactPlayer,type ImpactTarget} from '@/lib/jornadaAbsenceImpact';
import type {JornadaMarket} from '@/lib/nbaJornada';
export function useJornadaInjuryImpact(date:string,market:JornadaMarket,slate:boolean,players:ImpactTarget[],retry=0){
 const normalized=[...players].sort((a,b)=>impactPlayerKey(a).localeCompare(impactPlayerKey(b))),key=JSON.stringify([date,market,slate,normalized,retry]);
 const cache=useRef(new Map<string,{until:number;data:AutoImpactReport}>());
 const [state,setState]=useState<{key:string;results:Record<string,AutoImpactPlayer>;loading:boolean;error:string|null}|null>(null);
 useEffect(()=>{
  if(!normalized.length)return;
  const controller=new AbortController(),batches:AutoImpactRequest[]=[];
  for(let i=0;i<normalized.length;i+=40)batches.push(automaticImpactRequest({date,market,slate,players:normalized.slice(i,i+40)})!);
  setState({key,results:{},loading:true,error:null});
  let next=0;
  async function run(){while(next<batches.length&&!controller.signal.aborted){const request=batches[next++],cacheKey=JSON.stringify([request,retry]);let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const old=cache.current.get(cacheKey);let data=old&&old.until>Date.now()?old.data:null;
    if(!data){const timeout=new AbortController(),cancel=()=>timeout.abort();controller.signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(cancel,65000);
     try{const response=await fetch('/api/nba-jornada-impact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:timeout.signal,cache:'no-store'});if(response.status===401)throw Error('Tu sesión terminó. Volvé a iniciar sesión.');const body=await response.json();if(!response.ok||!matchingImpactReport(body,request))throw Error('No pudimos verificar las bajas de algunos jugadores.');data=body;}
     finally{controller.signal.removeEventListener('abort',cancel);if(timer)clearTimeout(timer);}
     if(data&&!data.results.some(r=>r.status==='unavailable')){cache.current.set(cacheKey,{until:Date.now()+60000,data});if(cache.current.size>16)cache.current.delete(cache.current.keys().next().value!);}
    }
    if(!controller.signal.aborted&&data){const entries=Object.fromEntries(data.results.map(p=>[impactPlayerKey(p),p]));setState(old=>old?.key===key?{...old,results:{...old.results,...entries}}:old);}
   }catch(error){if(!controller.signal.aborted)setState(old=>old?.key===key?{...old,error:error instanceof Error&&error.message.startsWith('Tu sesión')?error.message:'No pudimos verificar las bajas de algunos jugadores.'}:old);}
  }}
  Promise.all(Array.from({length:Math.min(2,batches.length)},run)).then(()=>{if(!controller.signal.aborted)setState(old=>old?.key===key?{...old,loading:false}:old);});
  return()=>controller.abort();
 // All request fields, including the player list, are represented by key.
 },[key]);
 const current=state?.key===key?state:null;
 return {results:current?.results??{},loading:normalized.length>0&&(!current||current.loading),error:current?.error??null};
}
