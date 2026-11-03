'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Search,SlidersHorizontal,ArrowUpRight,Plus,Ticket,CalendarDays} from 'lucide-react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {JORNADA_MARKETS,BOOK_LABELS,availableLines,defaultLine,quoteAt,summaryFor,jornadaPlayerHref,jornadaLeg,contextFor,plusDays,type JornadaData,type JornadaMarket,type JornadaPlayer} from '@/lib/nbaJornada';
import {appendDraft,readDraft} from '@/lib/ticketReader/draft';
import {getTeamColor} from '@/lib/teamColors';
import {defenseSeason,defensePosition,rankFor,rankBand,DEFENSE_BANDS,type DefenseBand,type DefenseReport} from '@/lib/nbaDefense';
import styles from './jornada.module.css';

const number=(v:number|null,d=1)=>v===null?'S/D':v.toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
function shortDate(date:string){const [y,m,d]=date.split('-');return `${d}/${m}/${y}`;}
function capture(raw:string|null){return raw?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(raw))+' AR':'Sin captura';}
type Choice={line:number|null;book:string|null};
export default function JornadaExplorer({initialDate,storageKey}:{initialDate:string;storageKey:string}){
  const [date,setDate]=useState(initialDate),[market,setMarket]=useState<JornadaMarket>('pts');
  const [search,setSearch]=useState(''),[gameId,setGameId]=useState('all'),[book,setBook]=useState('all'),[side,setSide]=useState<'over'|'under'>('over');
  const [sample,setSample]=useState<5|10>(10),[minimum,setMinimum]=useState(0),[onlyQuotes,setOnlyQuotes]=useState(false),[sort,setSort]=useState('average');
  const [choices,setChoices]=useState<Record<string,Choice>>({}),[notice,setNotice]=useState(''),[draftCount,setDraftCount]=useState(0),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const [defenseBand,setDefenseBand]=useState<DefenseBand>('all');
  const [defenseSeasonChoice,setDefenseSeasonChoice]=useState<{date:string;season:string}|null>(null);
  const [visibleLimit,setVisibleLimit]=useState(40);
  useEffect(()=>setVisibleLimit(40),[date,market,search,gameId,book,side,sample,minimum,onlyQuotes,sort]);

  const referenceSeason=defenseSeasonChoice?.date===date?defenseSeasonChoice.season:defenseSeason(date);
  const defenseQuery=useAnalysisQuery<DefenseReport>(`/api/nba-defense?market=${market}&asOfDate=${date}&season=${referenceSeason}&phase=Regular%20Season`);
  const defense=defenseQuery.data?.available?defenseQuery.data:null;
  const query=useAnalysisQuery<JornadaData>(`/api/nba-jornada?date=${date}&market=${market}&refresh=${retry}`),data=query.data;
  useEffect(()=>{
    const update=()=>{try{setDraftCount(readDraft(localStorage,storageKey)?.document.legs.length??0);}catch{setDraftCount(0);}};
    update();window.addEventListener('storage',update);window.addEventListener('nba-ticket-draft',update);
    return()=>{window.removeEventListener('storage',update);window.removeEventListener('nba-ticket-draft',update);};
  },[storageKey]);
  function key(p:JornadaPlayer){return [date,market,side,book,p.gameId,p.id].join(':');}
  function selection(p:JornadaPlayer){const choice=choices[key(p)];return {line:choice?choice.line:defaultLine(p,book,side),book:choice?.book??(book==='all'?null:book)};}
  function choose(p:JornadaPlayer,change:Partial<Choice>){setNotice('');setChoices(old=>({...old,[key(p)]:{...selection(p),...change}}));}
  const visible=useMemo(()=>{
    const normalized=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const rows=(data?.players??[]).filter(p=>(gameId==='all'||p.gameId===gameId)&&`${p.name} ${p.team} ${p.opponent}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalized))
      .map(p=>{const s=selection(p),stats=summaryFor(p,sample,s.line,side);return {p,...s,...stats};})
      .filter(row=>row.stat.valid>=Math.min(minimum,sample)&&(!onlyQuotes||availableLines(row.p,book,side).length>0))
      .filter(row=>defenseBand==='all'||rankBand(rankFor(defense,row.p.opponent,defensePosition(row.p.position)))===defenseBand);
    const metric=(r:typeof rows[number])=>sort==='minutes'?r.minutes.average:sort==='rate'?r.line===null?null:r.stat.rate:r.stat.average;
    return rows.sort((a,b)=>{const av=metric(a),bv=metric(b);return av===null&&bv!==null?1:bv===null&&av!==null?-1:(bv??0)-(av??0)||a.p.name.localeCompare(b.p.name,'es');});
  // Selection state is explicitly keyed by the event, market, side and house.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data,search,gameId,book,side,sample,minimum,onlyQuotes,sort,choices,defense,defenseBand]);
  async function add(p:JornadaPlayer){
    const game=data?.games.find(g=>g.id===p.gameId),s=selection(p);if(!game||s.line===null)return;
    setBusy(true);setNotice('');
    try{
      const leg=jornadaLeg(p,game,date,market,s.line,side,s.book),href=jornadaPlayerHref(p,game,date,market,s.line,side,sample);
      const run=()=>appendDraft(localStorage,storageKey,leg,href);
      const saved=navigator.locks?await navigator.locks.request('nba-ticket-draft:'+storageKey,run):run();
      setDraftCount(saved.draft.document.legs.length);window.dispatchEvent(new Event('nba-ticket-draft'));
      setNotice(`${saved.duplicate?'Selección actualizada':'Selección agregada'}: ${p.name}. ${saved.draft.document.legs.length} en el analizador.${leg.odds===null?' Sin cuota individual elegida.':''}`);
    }catch(error){const code=error instanceof Error?error.message:'';setNotice(code==='DRAFT_DATE_CONFLICT'?'El borrador es de otra fecha. Abrí el analizador, descargalo y vacialo antes de empezar otro día.':code==='DRAFT_FULL'?'El borrador llegó al límite de 40 selecciones.':code==='DRAFT_CONFLICT'?'El borrador cambió en otra pestaña. Volvé a agregar la selección.':'No pudimos guardar la selección. Revisá que el navegador permita guardar datos y abrí el analizador para comprobar el borrador.');}
    finally{setBusy(false);}
  }
  return <section className={styles.explorer} aria-label="Explorador de la jornada">
    <div className={styles.topline}><p><CalendarDays size={15}/><strong>Jugadores de la jornada</strong><span>Partido completo</span></p><Link href="/analizar-ticket" className={styles.analyzer}><Ticket size={14}/> Analizador{draftCount>0?` (${draftCount})`:''}</Link></div>
    <div className={styles.filters}>
      <label>Fecha · Argentina<input aria-label="Fecha de la jornada" type="date" min={initialDate} max={plusDays(initialDate,7)} value={date} onChange={e=>{if(e.target.value){setDate(e.target.value);setGameId('all');setNotice('');}}}/></label>
      <label>Mercado<select aria-label="Mercado" value={market} onChange={e=>{setMarket(e.target.value as JornadaMarket);setNotice('');}}>{Object.entries(JORNADA_MARKETS).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
      <label className={styles.search}>Buscar jugador o equipo<span><Search size={15}/><input aria-label="Buscar jugador o equipo" placeholder="Nombre, equipo o rival…" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></span></label>
      <label>Partido<select aria-label="Partido" value={gameId} onChange={e=>setGameId(e.target.value)}><option value="all">Todos los partidos</option>{data?.games.map(g=><option key={g.id} value={g.id}>{g.away} @ {g.home}</option>)}</select></label>
      <label>Casa<select aria-label="Casa" value={book} onChange={e=>setBook(e.target.value)}><option value="all">Todas las casas</option>{Object.entries(BOOK_LABELS).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
      <label>Condición<select aria-label="Condición" value={side} onChange={e=>setSide(e.target.value as 'over'|'under')}><option value="over">Más de (Over)</option><option value="under">Menos de (Under)</option></select></label>
      <label>Aciertos y orden<select aria-label="Aciertos y orden" value={sample} onChange={e=>setSample(Number(e.target.value) as 5|10)}><option value={5}>Últimos 5 partidos</option><option value={10}>Últimos 10 partidos</option></select></label>
      <details className={styles.more}><summary><SlidersHorizontal size={14}/> Más filtros</summary><div><label>Mínimo con datos<select aria-label="Mínimo con datos" value={minimum} onChange={e=>setMinimum(Number(e.target.value))}><option value={0}>Sin mínimo</option><option value={5}>5 partidos</option><option value={10}>Muestra completa</option></select></label><label>Ordenar por<select aria-label="Ordenar por" value={sort} onChange={e=>setSort(e.target.value)}><option value="average">Promedio del mercado</option><option value="minutes">Minutos promedio</option><option value="rate">Acierto histórico de la línea</option></select></label><label>Temporada de defensa<select aria-label="Temporada defensiva Jornada" value={referenceSeason} onChange={e=>setDefenseSeasonChoice({date,season:e.target.value})}>{[...new Set([referenceSeason,...(defenseQuery.data?.seasons??[])])].sort().reverse().map(season=><option value={season} key={season}>{season}</option>)}</select></label><label>Defensa por posición<select aria-label="Defensa de la jornada" value={defenseBand} onChange={e=>setDefenseBand(e.target.value as DefenseBand)}>{Object.entries(DEFENSE_BANDS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={onlyQuotes} onChange={e=>setOnlyQuotes(e.target.checked)}/> Solo con cuotas publicadas</label></div></details>
    </div>
    <div className={styles.quickFilters} role="group" aria-label="Filtros rápidos de jugadores"><button type="button" aria-pressed={onlyQuotes} onClick={()=>setOnlyQuotes(v=>!v)}>Con cuotas disponibles</button><button type="button" aria-pressed={minimum>=5} onClick={()=>setMinimum(v=>v>=5?0:5)}>Al menos 5 partidos</button><span>Muestra histórica: esta temporada y la anterior</span></div>
    <p role="status" className={styles.notice}>{notice}</p>
    {query.loading?<div className={styles.empty} role="status">Cargando partidos, jugadores y estadísticas…</div>:query.error?<div className={styles.empty} role="alert"><p>{query.error}</p><button onClick={()=>setRetry(v=>v+1)}>Reintentar</button></div>:data?<>
      {data.warnings.map(w=><p key={w} className={styles.warning} role="status">{w}</p>)}
      {defenseBand!=="all"&&<p className={styles.warning} role="status">{defenseQuery.loading?"Cargando referencia defensiva…":!defense?"La referencia defensiva no está disponible.":`Filtro por posición · ${defense.settings.season} · temporada regular · mínimo 5 PJ por equipo; requiere 30 equipos con muestra.`} <button type="button" onClick={()=>setDefenseBand("all")}>Quitar filtro defensivo</button></p>}
      <div className={styles.resultbar}><span>{visible.length} jugadores · {data.games.length} partidos</span><span>Plantel: {shortDate(data.rosterAt.slice(0,10))} · consulta {capture(data.generatedAt)}</span></div>
      {!data.games.length?<div className={styles.empty}>No hay partidos en el calendario para el {shortDate(date)}.</div>:<>
        <div className={styles.games}>{data.games.map(g=><Link key={g.id} href={contextFor(g,date).returnTo}>{g.away} @ {g.home}<span>{g.status===3?'Finalizado':g.status===2?'En juego':g.start?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(g.start))+' AR':'Horario S/D'}<ArrowUpRight size={12}/></span></Link>)}</div>
        {!visible.length?<div className={styles.empty}>No hay jugadores que coincidan con estos filtros.<button onClick={()=>{setSearch('');setGameId('all');setOnlyQuotes(false);setMinimum(0);setDefenseBand('all');}}>Limpiar filtros</button></div>:<div className={styles.results}>
          {visible.slice(0,visibleLimit).map(({p,line,book:selectedBook,stat,minutes})=>{
            const game=data.games.find(g=>g.id===p.gameId)!,href=jornadaPlayerHref(p,game,date,market,line,side,sample),l5=summaryFor(p,5,line,side).stat,l10=summaryFor(p,10,line,side).stat;
            const lines=availableLines(p,book,side),selectedQuote=selectedBook?quoteAt(p,selectedBook,line,side):null;
            const defenseRow=rankFor(defense,p.opponent,defensePosition(p.position));
            return <article key={p.gameId+':'+p.id} className={styles.row}>
              <Link className={styles.player} href={href}><span className={styles.avatar} style={{background:getTeamColor(p.team)+'18',color:getTeamColor(p.team),borderColor:getTeamColor(p.team)+'40'}}>{p.name.split(' ').map(v=>v[0]).slice(0,2).join('')}</span><span><strong>{p.name}</strong><small>{p.team} {p.team===game.away?'@':'vs.'} {p.opponent} · {p.position||'Posición S/D'}</small><small>{p.dates.length?`${shortDate(p.dates[p.dates.length-1])} – ${shortDate(p.dates[0])}`:'Sin partidos con datos'}</small><small title="1º es el que más permite a la posición; suma de sus jugadores. Referencia de temporada regular, partido completo.">Defensa {p.opponent}: {defenseRow?.rank?`${defenseRow.rank}º/${defenseRow.rankedTeams}`:"S/D"} · {defenseRow?.games??0} PJ · {referenceSeason}</small></span></Link>
              <div className={styles.metric}><span>L5 · {l5.valid}/5</span><strong>{number(l5.average)}</strong></div>
              <div className={styles.metric}><span>L10 · {l10.valid}/10</span><strong>{number(l10.average)}</strong></div>
              <div className={styles.metric}><span>MIN L{sample} · {minutes.valid}/{sample}</span><strong>{number(minutes.average)}</strong></div>
              <label className={styles.line}>{side==='over'?'Más de':'Menos de'}<input type="number" min="0.5" max="300" step="0.5" value={line??''} placeholder="Línea" aria-label={`Línea de ${p.name}`} list={`lines-${p.gameId}-${p.id}`} onChange={e=>{const raw=e.target.value;choose(p,{line:raw===''||!Number.isFinite(Number(raw))?null:Number(raw),book:book==='all'?null:book});}}/><datalist id={`lines-${p.gameId}-${p.id}`}>{lines.map(l=><option key={l} value={l}/>)}</datalist></label>
              <div className={styles.metric}><span>Aciertos L{sample}</span><strong className={stat.decided>=5&&line!==null?styles.rate:undefined}>{line===null?'—':stat.rate===null?'S/D':number(stat.rate,0)+'%'}</strong><small>{line===null?'Elegí una línea':stat.valid===0?'Sin muestra para evaluar':`${stat.hits}/${stat.decided} decididos${stat.pushes?` · ${stat.pushes} empate${stat.pushes>1?'s':''}`:''}${stat.valid<sample?' · incompleto':''}`}</small></div>
              <div className={styles.prices}><span>Cuota individual · {side==='over'?'Over':'Under'}</span><div>{Object.entries(BOOK_LABELS).filter(([b])=>book==='all'||b===book).map(([b,label])=>{const q=quoteAt(p,b,line,side);return <button key={b} className={selectedBook===b?styles.priceSelected:undefined} disabled={!q} aria-label={`${label} para ${p.name}`} aria-pressed={selectedBook===b} title={q?'Cuota individual para esta selección':'Sin precio para esta línea'} onClick={()=>choose(p,{book:b})}><small>{label}</small><strong>{q?number(q.price,2):'—'}</strong></button>;})}</div><small>{selectedQuote?'Cuota seleccionada para el analizador':'Elegí la casa para copiar su precio'}</small></div>
              <div className={styles.actions}><Link href={href}>Ver ficha <ArrowUpRight size={13}/></Link><button disabled={busy||line===null||line<=0||line>300} onClick={()=>add(p)}><Plus size={13}/> Al analizador</button></div>
            </article>;
          })}
        </div>}
        {visible.length>visibleLimit&&<button type="button" className={styles.morePlayers} onClick={()=>setVisibleLimit(n=>n+40)}>Mostrar 40 más · {Math.min(visibleLimit,visible.length)} de {visible.length}</button>}
      </>}
      <details className={styles.method}><summary>Muestra y lectura de los datos</summary><p>L5 y L10 usan los registros recientes del archivo verificado anteriores a la fecha elegida. Solo temporada regular y playoffs; se limitan a esta temporada y la anterior y pueden incluir equipos históricos. El equipo y rival de la jornada se toman del plantel de referencia y del calendario. En la ficha podés profundizar con todos los filtros.</p><p>Se indica la cantidad válida sobre 5 o 10, aunque el resumen tenga menos registros. Los datos ausentes quedan S/D y un cero confirmado se conserva. Los porcentajes cuentan aciertos sobre resultados decididos: un resultado igual a la línea es empate y se muestra aparte. Describen esta muestra; no son una probabilidad calculada del próximo encuentro.</p><p>Las cuotas son las últimas capturas publicadas para la misma fecha, rival, mercado, período, lado y línea. Pueden haber cambiado en la casa. Al cambiar línea se retira la casa seleccionada; elegila otra vez para llevar el precio. Una línea inicial visible se elige por cercanía a una cuota pareja y puede editarse. No implica recomendación. Agregar al analizador guarda un borrador que tenés que revisar y analizar.</p>{data.archiveId&&<p>Versión histórica: <code>{data.archiveId}</code></p>}</details>
    </>:null}
  </section>;
}
