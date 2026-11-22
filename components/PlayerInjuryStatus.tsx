'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {selectPlayerInjury,reportDateLabel,reportTimeLabel,type InjuryReport} from '@/lib/injuryReport';
import {parseGameContext,type GameContext} from '@/lib/playerNavigation';
import {isDate} from '@/lib/ticketReader/model';
import InjuryStatusBadge from './InjuryStatusBadge';

export default function PlayerInjuryStatus({playerId,team,date,context}:{playerId:number|string;team:string|null;date:string;context:GameContext|null}){
 const owner=[playerId,date,context?.away,context?.home].join('|');
 const [live,setLive]=useState<{owner:string;date:string;context:GameContext|null}|null>(null);
 useEffect(()=>{
  const receive=(event:Event)=>{
   const d=(event as CustomEvent).detail;
   if(String(d?.playerId)!==String(playerId)||!isDate(d.eventDate))return;
   const c=d.context?parseGameContext(new URLSearchParams({game:`${d.context.away}-${d.context.home}`,date:d.eventDate,...(d.context.start?{start:d.context.start}:{})})):null;
   setLive({owner,date:d.eventDate,context:c});
  };
  window.addEventListener('player-dvp-context-change',receive);
  return()=>window.removeEventListener('player-dvp-context-change',receive);
 },[owner,playerId]);
 const {date:targetDate,context:targetContext}=live?.owner===owner?live:{date,context};
 const {data:report}=useAnalysisQuery<InjuryReport>(`/api/injury-report?date=${targetDate}`);
 if(!report?.available)return null;
 const own=selectPlayerInjury(report,playerId,targetDate,targetContext);
 if(!own)return null;
 return <section data-inline-injury aria-label="Estado médico del jugador" className="mosk-injury-strip">
   {own&&<div className="flex flex-wrap items-center gap-2">
     <InjuryStatusBadge item={own}/>
     {own.reason&&<span>{own.reason}</span>}
     {(report.stale||own.stale||own.conflict)&&<strong>Revisar vigencia del parte</strong>}
   </div>}
   <Link href={`/injuries?date=${targetDate}${team?'&team='+team:''}`} className="mosk-text-link" title={own?`Parte del ${reportDateLabel(own.reportGameDate)} · ${reportTimeLabel(own.reportAt)}`:'Ver el parte publicado'}>Ver parte ↗</Link>
 </section>;
}
