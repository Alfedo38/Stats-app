'use client';
import {useState,useMemo} from 'react';
import {useAnalysisQuery} from './useAnalysisQuery';
import {argentinaDate,isDate} from '@/lib/ticketReader/model';
import {eventContext,eventMessage,safeEventData,type PlayerEventData} from '@/lib/playerEvent';
import type {GameContext} from '@/lib/playerNavigation';
export function usePlayerEvent({playerId,team,initialContext,referenceDate}:{playerId:string|number|null|undefined;team?:string|null;initialContext:GameContext|null;referenceDate?:string|null}){
 const owner=String(playerId??''),today=argentinaDate();
 const [selection,setSelection]=useState<{owner:string;date:string;mode:'upcoming'|'day';id:string|null}|null>(null),[retry,setRetry]=useState(0);
 const active=selection?.owner===owner?selection:null,date=active?.date??initialContext?.date??(isDate(referenceDate)?referenceDate:today),mode=active?.mode??(initialContext?'day':'upcoming');
 const query=useAnalysisQuery<PlayerEventData>(/^[1-9]\d{0,12}$/.test(owner)&&isDate(date)?`/api/ticket-reader/context?playerId=${owner}&date=${date}&mode=${mode}&retry=${retry}`:null,undefined,10000);
 const data=safeEventData(query.data,owner,date,mode),dataError=query.error??(query.data&&!data?'No pudimos verificar el calendario.':null),games=data?.available?data.games:[],chosen=active?.id?games.find(g=>g.id===active.id):mode==='upcoming'&&games.length&&games.filter(g=>g.start===games[0].start).length===1?games[0]:games.length===1?games[0]:null;
 const linked=!active?initialContext:null,context=useMemo(()=>linked?(games.find(g=>g.date===linked.date&&g.away===linked.away&&g.home===linked.home)?eventContext(games.find(g=>g.date===linked.date&&g.away===linked.away&&g.home===linked.home)!):linked):chosen?eventContext(chosen):null,[linked,games,chosen]);
 const currentTeam=data?.team??team??null,opponent=context&&currentTeam&&[context.away,context.home].includes(currentTeam)?context.away===currentTeam?context.home:context.away:null;
 const source=linked?'link':context?'calendar':'pending';
 return {playerId:owner,selectedByUser:!!active,context,team:currentTeam,opponent,data,games,date,mode,source,loading:query.loading,error:dataError,
  message:context?`${context.away} – ${context.home} · ${context.date.split('-').reverse().join('/')}${source==='calendar'?' · calendario':' · partido del enlace'}`:eventMessage(data?.status,mode,query.loading,!!dataError),
  choose:(id:string)=>{if(games.some(g=>g.id===id))setSelection({owner,date,mode,id});},
  setDate:(next:string)=>setSelection({owner,date:next,mode:'day',id:null}),
  next:()=>{setSelection({owner,date:today,mode:'upcoming',id:null});setRetry(n=>n+1);},retry:()=>setRetry(n=>n+1)};
}
export type PlayerEventState=ReturnType<typeof usePlayerEvent>;
