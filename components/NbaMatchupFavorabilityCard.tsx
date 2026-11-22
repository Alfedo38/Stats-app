'use client';

import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {selectPlayerInjury,type InjuryReport} from '@/lib/injuryReport';
import type {MatchupEstimate,MatchupStat} from '@/lib/nbaMatchupFavorability';
import type {FavorabilityResponse} from '@/lib/nbaMatchupFavorabilityData';
import type {GameContext} from '@/lib/playerNavigation';
import styles from './NbaMatchupFavorabilityCard.module.css';

const labels:Record<MatchupStat,string>={pts:'Puntos',reb:'Rebotes',ast:'Asistencias'};
const units:Record<MatchupStat,string>={pts:'PTS',reb:'REB',ast:'AST'};
const groups={G:'a bases y escoltas',F:'a aleros y ala-pívots',C:'a pívots',ALL:'en total'};
const directions={favorable:'Favorable',demanding:'Exigente',neutral:'Parejo',unknown:'Sin ajuste'};
const reasons={
  calendar:'No hay un partido verificado para este cruce.',
  team:'Falta confirmar el equipo del jugador para esta fecha.',
  archive:'No hay histórico publicado para calcular este ajuste.',
  phase:'Ajuste disponible para temporada regular y playoffs.',
};
const fmt=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const diff=(value:number|null)=>value===null?'—':(value>0?'+':value<0?'−':'')+fmt(Math.abs(value));

function why(row:MatchupEstimate,rival:string){
  const d=row.defense;
  if(!d) return 'Todavía no hay suficiente cobertura defensiva comparable.';
  const pct=fmt(Math.abs(d.differencePct));
  if(Math.abs(d.differencePct)<.05) return `${rival} concede cerca del promedio ${groups[d.group]}.`;
  return `${rival} concede un ${pct} % ${d.differencePct>0?'más':'menos'} ${groups[d.group]} que la referencia de la liga.`;
}

export function MatchupFavorabilityReadout({result,market='pts',out=false}:{result:FavorabilityResponse;market?:string;out?:boolean}){
  if(!result.available) return <div className={styles.unavailable} role="status">{reasons[result.reason]}</div>;
  const rows=result.data.metrics, active=rows.find(r=>r.stat===market)??rows.find(r=>r.defense)??rows[0];
  if(out) return <div className={styles.unavailable}>Figura fuera en el parte de este partido.</div>;
  if(!active||!rows.some(r=>r.base||r.defense)) return <div className={styles.unavailable}>Todavía no hay partidos suficientes para calcular el ajuste.</div>;
  const hasScenario=rows.some(r=>r.kind==='scenario'), hasEstimate=rows.some(r=>r.kind==='estimate');
  return <>
    <div className={styles.why} data-tone={active.direction}>
      <strong>{labels[active.stat]} · {directions[active.direction]}</strong>
      <p>{why(active,result.opponent)}</p>
    </div>
    <table className={styles.metrics} aria-label="Producción reciente y ajuste de puntos, rebotes y asistencias">
      <thead><tr><th scope="col" aria-label="Estadística"></th><th scope="col">Base</th><th scope="col">Con rival</th><th scope="col" aria-label="Diferencia">Dif.</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.stat} data-active={row.stat===market}>
        <th scope="row"><abbr title={labels[row.stat]}>{units[row.stat]}</abbr></th>
        <td>{fmt(row.base?.value)}</td>
        <td><strong>{fmt(row.adjusted)}</strong>{row.kind==='scenario'&&<sup aria-label="Escenario">*</sup>}</td>
        <td data-tone={row.direction}>{diff(row.delta)}</td>
      </tr>)}</tbody>
    </table>
    <p className={styles.note}>Partido completo · si juega.{hasScenario?' * Escenario: mejora sin confirmar.':hasEstimate?' Estimación con evaluación histórica.':''}</p>
    <details className={styles.evidence}>
      <summary>Qué sostiene el ajuste</summary>
      <p>Base: hasta 10 partidos con el mismo equipo, temporada y fase. El ajuste usa parte de la diferencia defensiva según la cobertura. No incorpora bajas, ritmo extra ni cuotas.</p>
      {rows.map(row=>{
        const d=row.defense,v=row.validation,b=row.base;
        return <div key={row.stat} className={styles.statDetail}>
          <strong>{labels[row.stat]}</strong>
          <p>{b?`Base: ${b.games}/${b.total} PJ · ${fmt(b.minutes)} min de media.`:'Faltan partidos recientes del jugador para una base comparable.'}</p>
          {d&&<p>{result.opponent}: {fmt(d.opponentAllowed)} vs. {fmt(d.leagueAllowed)} {groups[d.group]} por PJ. {d.games}/{d.total} PJ con dato · {d.teams} equipos en la referencia.{row.adjusted!==null&&` Ajuste aplicado: ${diff(d.appliedPct)} %.`}</p>}
          {v.games>0&&<p>Error histórico por PJ: {fmt(v.referenceError)} base → {fmt(v.adjustedError)} ajustado en {v.games} partidos. {v.improved?'El ajuste mejoró la referencia.':v.games<20?'Muestra insuficiente para confirmar mejora.':'No se confirmó una mejora sobre la base.'}</p>}
        </div>;
      })}
    </details>
  </>;
}

export default function NbaMatchupFavorabilityCard({context,playerId,market,injuries}:{context:GameContext;playerId:number;market:string;injuries:InjuryReport|null}){
  const {away,home,date}=context;
  const request=useAnalysisQuery<FavorabilityResponse>('/api/nba-favorabilidad?'+new URLSearchParams({playerId:String(playerId),away,home,date}),undefined,16000);
  const result=request.data;
  const injury=injuries&&result?.available?selectPlayerInjury(injuries,playerId,date,context):null;
  const out=!!(injury&&result?.available&&injury.status==='OUT'&&!injury.stale&&!injuries?.stale&&!injury.conflict&&
    injury.team===result.team&&Number(injury.game?.id)===Number(result.gameId)&&injury.reportAt&&Date.parse(injury.reportAt)<=Date.parse(result.start));
  return <section className={styles.card} aria-label="Ajuste por rival" aria-busy={request.loading}>
    <header className={styles.header}><h3>Ajuste por rival</h3>{result?.available&&<span>{result.opponent}</span>}</header>
    {request.loading?<p className={styles.unavailable} role="status">Calculando el cruce…</p>:request.error
      ?<p className={styles.unavailable} role="status">No pudimos verificar el ajuste.</p>
      :result?<MatchupFavorabilityReadout result={result} market={market} out={out}/>:null}
  </section>;
}
