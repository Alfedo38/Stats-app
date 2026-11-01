'use client';
import {useEffect,useRef} from 'react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {isDate,type Leg} from '@/lib/ticketReader/model';
export type PlayerGameChoices={ok:boolean;playerId:number;date:string;team:string|null;referenceAt:string;verified:boolean;available:boolean;games:{id:string;away:string;home:string}[];message:string};
export default function AnalyzerGameChoice({leg,date,disabled,onChange}:{leg:Leg;date:string;disabled:boolean;onChange:(patch:Partial<Leg>)=>void}){
 const query=useAnalysisQuery<PlayerGameChoices>(leg.playerId&&isDate(date)?`/api/ticket-reader/context?playerId=${leg.playerId}&date=${date}`:null);
 const applied=useRef('');const data=query.data;
 function choose(id:string){const game=data?.games.find(g=>g.id===id);if(!game||!data?.verified)return;onChange({teams:[game.away,game.home],matchup:`${game.away} – ${game.home}`,playerTeam:data.team??undefined,teamConfirmed:false,teamSource:'schedule',odds:leg.origin==='player-page'?null:leg.odds,quoteCapturedAt:leg.origin==='player-page'?undefined:leg.quoteCapturedAt});}
 useEffect(()=>{
  if(!data?.verified||data.games.length!==1||disabled)return;
  const game=data.games[0],key=`${leg.playerId}:${date}:${game.id}`;
  if(applied.current===key||leg.teams.filter(Boolean).length===2||leg.teams.filter(Boolean).some(t=>t!==game.away&&t!==game.home))return;
  applied.current=key;choose(game.id);
 },[data,leg.playerId,date,leg.teams.join('|'),disabled]);
 if(!leg.playerId)return null;
 return <div className="my-3 space-y-2 text-xs text-[var(--text-muted)]" aria-busy={query.loading}>
  {query.loading?<p>Buscando su equipo y partido…</p>:query.error?<p>No se pudo comprobar el calendario; podés completar los equipos manualmente.</p>:data&&<>
   <p>{data.team?`Equipo de referencia: ${data.team} · ${data.referenceAt}. `:''}{data.message}</p>
   {!!data.games.length&&<label>Partido para {date.split('-').reverse().join('/')}<select disabled={disabled} aria-label={`Partido de ${leg.playerName}`} value={data.games.find(g=>leg.teams.includes(g.away)&&leg.teams.includes(g.home))?.id??''} onChange={e=>choose(e.target.value)}><option value="">Elegir partido</option>{data.games.map(g=><option value={g.id} key={g.id}>{g.away} – {g.home}</option>)}</select></label>}
  </>}
 </div>;
}
