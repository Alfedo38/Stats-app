"use client";
import {useEffect,useState} from 'react';
export const PLAYER_PERIODS:Record<string,{short:string;label:string}>={FULL:{short:'PARTIDO',label:'Partido completo'},Q1:{short:'1Q',label:'Primer cuarto'},H1:{short:'1H',label:'Primera mitad'},H2_REG:{short:'2H',label:'Segunda mitad sin prórroga'}};
type Props={playerName:string;statLabel:string;scope:string};
export function ChartIdentity({playerName,statLabel,scope,count,line}:Props&{count:number;line:number}){
 const period=PLAYER_PERIODS[scope]??PLAYER_PERIODS.FULL;
 return <header className="mb-4 border-b border-[var(--border)] pb-3" data-chart-identity>
  <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-black uppercase tracking-tight text-[var(--text)] md:text-xl"><span>{playerName}</span><span className="text-[#10b981]">{statLabel} · {period.short}</span></h2>
  <p className="mt-1 text-xs text-[var(--text-muted)]">{period.label} · {count} partidos en el gráfico · Línea {Number.isFinite(line)?line.toLocaleString('es-AR'):'S/D'}</p>
 </header>;
}
export default function FloatingPlayerIdentity({playerName,statLabel,scope}:Props){
 const [position,setPosition]=useState({visible:false,top:8});
 useEffect(()=>{
  let frame=0;
  const measure=()=>{
   frame=0;
   const header=document.querySelector('[data-player-header]');
   const nav=document.querySelector('[data-player-nav]');
   const edge=Math.max(0,nav?.getBoundingClientRect().bottom??0);
   const visible=Boolean(header&&header.getBoundingClientRect().bottom<=edge);
   const top=Math.round(edge+8);
   setPosition(old=>old.visible===visible&&old.top===top?old:{visible,top});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  for(const el of document.querySelectorAll('[data-player-header], [data-player-nav]'))observer?.observe(el);
  schedule();
  return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);observer?.disconnect();if(frame)cancelAnimationFrame(frame);};
 },[playerName]);
 if(!position.visible)return null;
 const period=PLAYER_PERIODS[scope]??PLAYER_PERIODS.FULL;
 return <aside aria-label="Jugador y estadística actuales" style={{top:position.top}} className="pointer-events-none fixed left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#10b981]/35 bg-[var(--surface)] px-4 py-2 shadow-xl print:hidden">
  <span className="min-w-0 truncate text-sm font-black text-[var(--text)]" title={playerName}>{playerName}</span><span className="shrink-0 whitespace-nowrap text-xs font-black text-[#10b981]">{statLabel} · {period.short}</span>
 </aside>;
}
