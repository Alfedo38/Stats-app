'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Search,SlidersHorizontal,ArrowUpRight,Plus,Ticket,CalendarDays} from 'lucide-react';
import {useAnalysisQuery} from '@/hooks/useAnalysisQuery';
import {JORNADA_MARKETS,BOOK_LABELS,marketIsValid,jornadaEvidence,bestJornadaPrice,availableLines,publishedJornadaLine,defaultLine,validJornadaLine,JORNADA_MIN_LINE,JORNADA_MAX_LINE,quoteAt,summaryFor,jornadaPlayerHref,jornadaLeg,contextFor,plusDays,type JornadaData,type JornadaMarket,type JornadaPlayer} from '@/lib/nbaJornada';
import {nbaSlateDate} from '@/lib/nbaSlate';
import {selectionSummary} from '@/lib/selectionStats';
import {appendDraft,readDraft} from '@/lib/ticketReader/draft';
import {getTeamColor} from '@/lib/teamColors';
import {defenseSeason,defenseReferencePosition,rankFor,rankBand,DEFENSE_BANDS,type DefenseBand,type DefenseReport} from '@/lib/nbaDefense';
import styles from './jornada.module.css';
import AlternativeLines from '@/components/AlternativeLines';
import JornadaPresets from '@/components/JornadaPresets';
import NbaMarketSupport from '@/components/NbaMarketSupport';
import QuotePriceCards from '@/components/QuotePriceCards';
import JornadaAbsenceImpact from '@/components/JornadaAbsenceImpact';
import {useJornadaInjuryImpact} from '@/hooks/useJornadaInjuryImpact';
import {impactPlayerKey} from '@/lib/jornadaAbsenceImpact';

const number=(v:number|null,d=1)=>v===null?'S/D':v.toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
function shortDate(date:string){const [y,m,d]=date.split('-');return `${d}/${m}/${y}`;}
function explainSample(stat:ReturnType<typeof jornadaEvidence>['l5'],line:number|null,side:'over'|'under'){
  if(!stat.valid)return 'Sin datos para este mercado.';
  const average='Promedio: '+number(stat.average)+'.';
  if(line===null)return average+' Elegí una línea para comparar.';
  if(!stat.decided)return average+' Todos los resultados con dato igualaron la línea.';
  return stat.hits+' de '+stat.decided+' '+(side==='over'?'superaron':'quedaron por debajo de')+' '+number(line)+'. '+average+
    (stat.pushes?' Empates: '+stat.pushes+'.':'')+(stat.missing?' Sin dato: '+stat.missing+'.':'');
}
function sampleLabel(stat:ReturnType<typeof jornadaEvidence>['l5'],line:number|null){
  if(line===null)return 'Sin línea';
  if(!stat.decided)return stat.pushes?stat.pushes+' empate(s)':'S/D';
  return stat.hits+'/'+stat.decided+(stat.pushes?' · '+stat.pushes+' empate(s)':'');
}
function LineInput({id,name,line,side,onChange}:{id:string;name:string;line:number|null;side:'over'|'under';onChange:(line:number|null)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  return <label className={styles.line}>{side==='over'?'Más de':'Menos de'}
    <input type="number" min={JORNADA_MIN_LINE} max={JORNADA_MAX_LINE} step={1}
      value={draft??line??''} placeholder="Línea" aria-label={`Línea de ${name}`} list={id}
      title="Líneas desde 0,5 en pasos de 1. Referencia inicial: promedio L10."
      onChange={e=>{const raw=e.target.value,value=Number(raw);
        if(raw===''&&!e.target.validity.badInput){setDraft(null);onChange(null);}
        else if(validJornadaLine(value)){setDraft(null);onChange(value);}
        else setDraft(raw);
      }}
      aria-invalid={draft!==null}
      onBlur={()=>setDraft(null)}
      onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape')e.currentTarget.blur();}}
    />
  </label>;
}
type Choice={line:number|null;book:string|null};
export default function JornadaExplorer({initialDate,initialGame="all",today=initialDate,storageKey,nbaSlate=false,initialFilters={}}:{initialDate:string;initialGame?:string;today?:string;storageKey:string;nbaSlate?:boolean;initialFilters?:Record<string,string>}){
  const [date,setDate]=useState(initialDate),[market,setMarket]=useState<JornadaMarket>(marketIsValid(initialFilters.market)?initialFilters.market:'pts');
  const [search,setSearch]=useState(initialFilters.search??''),[gameId,setGameId]=useState(initialGame),[book,setBook]=useState(initialFilters.book??'all'),[side,setSide]=useState<'over'|'under'>(initialFilters.side==='under'?'under':'over');
  const [sample,setSample]=useState<5|10>(initialFilters.n==='5'?5:10),[minimum,setMinimum]=useState(Number(initialFilters.minimum??0)),[onlyQuotes,setOnlyQuotes]=useState(initialFilters.only==='1'),[sort,setSort]=useState(initialFilters.sort??(initialGame==='all'?'average':'rate'));
  const [choices,setChoices]=useState<Record<string,Choice>>({}),[notice,setNotice]=useState(''),[draftCount,setDraftCount]=useState(0),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const [defenseBand,setDefenseBand]=useState<DefenseBand>('all');
  const [defenseSeasonChoice,setDefenseSeasonChoice]=useState<{date:string;season:string}|null>(null);
  const [visibleLimit,setVisibleLimit]=useState(40);
  const [published,setPublished]=useState(initialFilters.mode==='prices');
  const [dense,setDense]=useState(true);
  useEffect(()=>setVisibleLimit(40),[date,market,search,gameId,book,side,sample,minimum,onlyQuotes,sort,published]);

  const query=useAnalysisQuery<JornadaData>(`/api/nba-jornada?date=${date}&market=${market}&refresh=${retry}${nbaSlate?'&slate=nba':''}`),data=query.data;
  const selectedGame=data?.games.find(g=>g.id===gameId);
  const defenseDate=selectedGame?nbaSlateDate(selectedGame.start,selectedGame.eventDate??date):date;
  const referenceSeason=defenseSeasonChoice?.date===date?defenseSeasonChoice.season:defenseSeason(defenseDate);
  const defenseQuery=useAnalysisQuery<DefenseReport>(`/api/nba-defense?market=${market}&asOfDate=${defenseDate}&season=${referenceSeason}&phase=Regular%20Season`);
  const defense=defenseQuery.data?.available?defenseQuery.data:null;
  useEffect(()=>{
    const update=()=>{try{setDraftCount(readDraft(localStorage,storageKey)?.document.legs.length??0);}catch{setDraftCount(0);}};
    update();window.addEventListener('storage',update);window.addEventListener('nba-ticket-draft',update);
    return()=>{window.removeEventListener('storage',update);window.removeEventListener('nba-ticket-draft',update);};
  },[storageKey]);
  function selectGame(id:string){
    setGameId(id);
    setSort(id==='all'?'average':'rate');
    setNotice('');
  }
  const normalized=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function matchesSearch(p:JornadaPlayer){return (gameId==='all'||p.gameId===gameId)&&`${p.name} ${p.team} ${p.opponent}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalized);}
  const searchedCount=(data?.players??[]).filter(matchesSearch).length;
  function returnHref(){return '/trending?'+new URLSearchParams({date,game:gameId,market,side,book,n:String(sample),sort,...(search.trim()?{search:search.trim()}:{}),...(published?{mode:'prices'}:{}),...(onlyQuotes?{only:'1'}:{}),...(minimum?{minimum:String(minimum)}:{}),...(nbaSlate?{slate:'nba'}:{})});}
  function key(p:JornadaPlayer){return [date,market,side,book,p.gameId,p.id,...(published?['published']:[])].join(':');}
  function selection(p:JornadaPlayer){const choice=choices[key(p)];const line=published?publishedJornadaLine(p,book,side,choice?.line):choice?choice.line:defaultLine(p);
    return {line,book:choice?.book??(book==='all'?(published?Object.keys(BOOK_LABELS).filter(b=>quoteAt(p,b,line,side)).sort((a,b)=>quoteAt(p,b,line,side)!.price-quoteAt(p,a,line,side)!.price)[0]??null:null):book)};}
  function choose(p:JornadaPlayer,change:Partial<Choice>){setNotice('');setChoices(old=>({...old,[key(p)]:{...selection(p),...change}}));}
  const visible=useMemo(()=>{
    const rows=(data?.players??[]).filter(matchesSearch)
      .map(p=>{const s=selection(p),stats=summaryFor(p,sample,s.line,side);return {p,...s,...stats};})
      .filter(row=>row.stat.valid>=Math.min(minimum,sample)&&(!(onlyQuotes||published)||(book==='all'?Object.keys(BOOK_LABELS):[book]).some(b=>quoteAt(row.p,b,row.line,side)!==null)))
      .filter(row=>defenseBand==='all'||rankBand(rankFor(defense,row.p.opponent,defenseReferencePosition(row.p.position)??'ALL'))===defenseBand);
    const metric=(r:typeof rows[number])=>sort==='minutes'?r.minutes.average:sort==='rate'?r.line===null?null:r.stat.rate:r.stat.average;
    return rows.sort((a,b)=>{
      if(sort==='rate'){
        // First show usable samples; one win in one game must not outrank sustained results.
        const tier=(r:typeof a)=>r.stat.decided>=5?2:r.stat.decided>0?1:0;
        const order=tier(b)-tier(a)||(b.stat.rate??-1)-(a.stat.rate??-1)||b.stat.decided-a.stat.decided;
        if(order)return order;
      }
      const av=metric(a),bv=metric(b);return av===null&&bv!==null?1:bv===null&&av!==null?-1:(bv??0)-(av??0)||a.p.name.localeCompare(b.p.name,'es');});
  // Selection state is explicitly keyed by the event, market, side and house.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data,search,gameId,book,side,sample,minimum,onlyQuotes,sort,choices,defense,defenseBand,published]);
  const injuryImpact=useJornadaInjuryImpact(date,market,nbaSlate,visible.slice(0,visibleLimit).map(({p})=>({playerId:p.id,gameId:p.gameId})),retry);
  const impactUnavailable=Object.values(injuryImpact.results).some(p=>p.status==='unavailable');
  async function add(p:JornadaPlayer){
    const game=data?.games.find(g=>g.id===p.gameId),s=selection(p);if(!game||s.line===null)return;
    setBusy(true);setNotice('');
    try{
      const eventDate=game.eventDate??date,leg=jornadaLeg(p,game,eventDate,market,s.line,side,s.book),href=jornadaPlayerHref(p,game,eventDate,market,s.line,side,sample,s.book,returnHref());
      const run=()=>appendDraft(localStorage,storageKey,leg,href);
      const saved=navigator.locks?await navigator.locks.request('nba-ticket-draft:'+storageKey,run):run();
      setDraftCount(saved.draft.document.legs.length);window.dispatchEvent(new Event('nba-ticket-draft'));
      setNotice(`${saved.duplicate?'Selección actualizada':'Selección agregada'}: ${p.name}. ${saved.draft.document.legs.length} en el analizador.${leg.odds===null?' Sin cuota individual elegida.':''}`);
    }catch(error){const code=error instanceof Error?error.message:'';setNotice(code==='DRAFT_DATE_CONFLICT'?'El borrador es de otra fecha. Abrí el analizador, descargalo y vacialo antes de empezar otro día.':code==='DRAFT_FULL'?'El borrador llegó al límite de 40 selecciones.':code==='DRAFT_CONFLICT'?'El borrador cambió en otra pestaña. Volvé a agregar la selección.':'No pudimos guardar la selección. Revisá que el navegador permita guardar datos y abrí el analizador para comprobar el borrador.');}
    finally{setBusy(false);}
  }
  return <section className={styles.explorer} aria-label="Explorador de la jornada">
    <div className={styles.quickFilters} role="group" aria-label="Modo de jornada"><button type="button" aria-pressed={!published} onClick={()=>setPublished(false)}>Explorar historial</button><button type="button" aria-pressed={published} onClick={()=>setPublished(true)}>Comparar cuotas</button></div>
    <div className={styles.topline}><p><CalendarDays size={15}/><strong>Jugadores de la jornada</strong><span>Partido completo</span></p><Link href="/analizar-ticket" className={styles.analyzer}><Ticket size={14}/> Analizador{draftCount>0?` (${draftCount})`:''}</Link></div>
    <div className={styles.filters}>
      <label>{nbaSlate?"Fecha de jornada NBA":"Fecha · Argentina"}<input aria-label="Fecha de la jornada" type="date" min={plusDays(today,-30)} max={plusDays(today,7)} value={date} onChange={e=>{if(e.target.value){setDate(e.target.value);selectGame('all');}}}/></label>
      <label>Mercado<select aria-label="Mercado" value={market} onChange={e=>{setMarket(e.target.value as JornadaMarket);setNotice('');}}>{Object.entries(JORNADA_MARKETS).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
      <label className={styles.search}>Buscar jugador o equipo<span><Search size={15}/><input aria-label="Buscar jugador o equipo" placeholder="Nombre, equipo o rival…" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></span></label>
      <label>Partido<select aria-label="Partido" value={gameId} onChange={e=>selectGame(e.target.value)}><option value="all">Todos los partidos</option>{data?.games.map(g=><option key={g.id} value={g.id}>{g.away} @ {g.home}</option>)}</select></label>
      <label>Casa<select aria-label="Casa" value={book} onChange={e=>setBook(e.target.value)}><option value="all">Todas las casas</option>{Object.entries(BOOK_LABELS).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
      <label>Condición<select aria-label="Condición" value={side} onChange={e=>setSide(e.target.value as 'over'|'under')}><option value="over">Más de (Over)</option><option value="under">Menos de (Under)</option></select></label>
      <label>Aciertos y orden<select aria-label="Aciertos y orden" value={sample} onChange={e=>setSample(Number(e.target.value) as 5|10)}><option value={5}>Últimos 5 partidos</option><option value={10}>Últimos 10 partidos</option></select></label>
      <details className={styles.more}><summary><SlidersHorizontal size={14}/> Más filtros</summary><div><label>Mínimo con datos<select aria-label="Mínimo con datos" value={minimum} onChange={e=>setMinimum(Number(e.target.value))}><option value={0}>Sin mínimo</option><option value={5}>5 partidos</option><option value={10}>Muestra completa</option></select></label><label>Ordenar por<select aria-label="Ordenar por" value={sort} onChange={e=>setSort(e.target.value)}><option value="average">Promedio del mercado</option><option value="minutes">Minutos promedio</option><option value="rate">Acierto histórico de la línea</option></select></label><label>Temporada de defensa<select aria-label="Temporada defensiva Jornada" value={referenceSeason} onChange={e=>setDefenseSeasonChoice({date,season:e.target.value})}>{[...new Set([referenceSeason,...(defenseQuery.data?.seasons??[])])].sort().reverse().map(season=><option value={season} key={season}>{season}</option>)}</select></label><label>Defensa por posición<select aria-label="Defensa de la jornada" value={defenseBand} onChange={e=>setDefenseBand(e.target.value as DefenseBand)}>{Object.entries(DEFENSE_BANDS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={onlyQuotes} onChange={e=>setOnlyQuotes(e.target.checked)}/> Solo con cuotas publicadas</label></div></details>
    </div>
    <div className={styles.quickFilters} role="group" aria-label="Filtros rápidos de jugadores"><button type="button" aria-pressed={onlyQuotes} onClick={()=>setOnlyQuotes(v=>!v)}>Con cuotas disponibles</button><button type="button" aria-pressed={minimum>=5} onClick={()=>setMinimum(v=>v>=5?0:5)}>Al menos 5 partidos</button><button type="button" aria-pressed={dense} onClick={()=>setDense(v=>!v)}>Vista compacta</button><span>Muestra histórica: esta temporada y la anterior</span></div>
    <JornadaPresets storageKey={storageKey} filters={{market,book,side,sample,minimum,onlyQuotes,sort,defenseBand,published,dense}} onApply={f=>{
      setMarket(f.market);setBook(f.book);setSide(f.side);setSample(f.sample);setMinimum(f.minimum);setOnlyQuotes(f.onlyQuotes);setSort(f.sort);
      setDefenseBand(f.defenseBand);setPublished(f.published);setDense(f.dense);setNotice('');setVisibleLimit(40);
    }}/>
    <p role="status" className={styles.notice}>{notice}</p>
    {query.loading?<div className={styles.empty} role="status">Cargando partidos, jugadores y estadísticas…</div>:query.error?<div className={styles.empty} role="alert"><p>{query.error}</p><button onClick={()=>setRetry(v=>v+1)}>Reintentar</button></div>:data?<>
      {data.warnings.map(w=><p key={w} className={styles.warning} role="status">{w}</p>)}
      {defenseBand!=="all"&&<p className={styles.warning} role="status">{defenseQuery.loading?"Cargando referencia defensiva…":!defense?"La referencia defensiva no está disponible.":`Filtro por posición · ${defense.settings.season} · temporada regular · mínimo 5 PJ por equipo; requiere 30 equipos con muestra.`} <button type="button" onClick={()=>setDefenseBand("all")}>Quitar filtro defensivo</button></p>}
      {data.games.length>0&&data.quotes==='ready'&&<p className={styles.resultbar}>{Object.entries(BOOK_LABELS).map(([key,label])=>{const found=data.players.filter(p=>(!selectedGame||p.gameId===selectedGame.id)&&availableLines(p,key,side).length).length;return <span key={key}>{label}: {found} con línea · {side==='over'?'Over':'Under'}</span>;})}</p>}
      <div className={styles.resultbar}><span>{visible.length} {visible.length===1?'jugador':'jugadores'} · {selectedGame?`${selectedGame.away} @ ${selectedGame.home}`:`${data.games.length} ${data.games.length===1?'partido':'partidos'}`}</span><span>Plantel: {shortDate(data.rosterAt.slice(0,10))}</span></div>
      {(injuryImpact.loading||injuryImpact.error||impactUnavailable)&&<p className={styles.resultbar} role="status"><span>{injuryImpact.loading?"Verificando bajas confirmadas…":injuryImpact.error??"Impacto de bajas: algunos datos no se pudieron verificar."}</span>{!injuryImpact.loading&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Reintentar</button>}</p>}
      {!data.games.length?<div className={styles.empty}>No hay partidos en el calendario para el {shortDate(date)}.</div>:<>
        <div className={styles.games} role="group" aria-label="Filtrar jugadores por partido">
          <button type="button" aria-pressed={gameId==='all'} onClick={()=>selectGame('all')}>Todos los partidos</button>
          {data.games.map(g=><button type="button" key={g.id} aria-pressed={gameId===g.id} onClick={()=>selectGame(g.id)}>{g.away} @ {g.home}<span>{g.eventDate&&g.eventDate!==date?"Madrugada · ":""}{g.status===3?'Finalizado':g.status===2?'En juego':g.start?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(g.start))+' AR':'Horario S/D'}</span></button>)}
        </div>
        {selectedGame&&<div className={styles.matchFocus}>
          <div><strong>{selectedGame.away} @ {selectedGame.home} · Jugadores de ambos equipos</strong>
          {sort==='rate'&&<p>Acierto histórico L{sample} contra la línea de cada jugador. Primero, muestras de 5 o más partidos decididos.</p>}</div>
          <Link href={contextFor(selectedGame,selectedGame.eventDate??date).returnTo}>Comparar equipos <ArrowUpRight size={12}/></Link>
        </div>}
        {!visible.length?<div className={styles.empty}>{searchedCount>0&&(published||onlyQuotes)?`${searchedCount} ${searchedCount===1?'jugador encontrado':'jugadores encontrados'} · sin resultados con estos filtros de cuota. ${data.quotes==='ready'?'Probá otra casa, lado o mercado.':'No pudimos verificar todos los precios.'}`:'No hay jugadores que coincidan con estos filtros.'}{(published||onlyQuotes)&&<button type="button" onClick={()=>{setPublished(false);setOnlyQuotes(false);}}>Ver historial sin cuotas</button>}<button onClick={()=>{setSearch('');selectGame('all');setOnlyQuotes(false);setMinimum(0);setDefenseBand('all');setDefenseSeasonChoice(null);setBook('all');setPublished(false);}}>Limpiar filtros</button></div>:<div className={styles.results} data-dense={dense}>
          {dense&&<div aria-hidden="true" className={styles.columnNames}><span>Jugador / rival</span><span>Línea</span><span>Evidencia reciente</span><span>Precios</span><span>Acciones</span></div>}
          {visible.slice(0,visibleLimit).map(({p,line,book:selectedBook,stat,minutes})=>{
            const game=data.games.find(g=>g.id===p.gameId)!,href=jornadaPlayerHref(p,game,game.eventDate??date,market,line,side,sample,selectedBook,returnHref());
            const {l5,l10,rival,rivalSource,dots,streak}=jornadaEvidence(p,line,side),best=book==='all'?bestJornadaPrice(p,line,side):null;
            const lines=availableLines(p,book,side),selectedQuote=selectedBook?quoteAt(p,selectedBook,line,side):null;
            const defenseRow=rankFor(defense,p.opponent,defenseReferencePosition(p.position)??'ALL');
            return <article key={p.gameId+':'+p.id} className={styles.row}>
              <Link className={styles.player} href={href}><span className={styles.avatar} style={{background:getTeamColor(p.team)+'18',color:getTeamColor(p.team),borderColor:getTeamColor(p.team)+'40'}}>{p.name.split(' ').map(v=>v[0]).slice(0,2).join('')}</span><span><strong>{p.name}</strong><small>{p.team} {p.team===game.away?'@':'vs.'} {p.opponent} · {p.position||'Posición S/D'}</small><small>{p.dates.length?`${shortDate(p.dates[p.dates.length-1])} – ${shortDate(p.dates[0])}`:'Sin partidos con datos'}</small><small title="1º es el que más permite a la posición; suma de sus jugadores. Referencia de temporada regular, partido completo.">Defensa {p.opponent}: {defenseRow?.rank?`${defenseRow.rank}º/${defenseRow.rankedTeams}`:"S/D"} · {defenseRow?.games??0} PJ · {referenceSeason}{!defenseReferencePosition(p.position)?" · total equipo":""}</small></span></Link>
              {published?<label className={styles.line}>Línea publicada<select className="rounded border border-[var(--border)] bg-[var(--bg)] p-2" value={line??''} onChange={event=>choose(p,{line:Number(event.target.value),book:null})}>{lines.filter(validJornadaLine).map(l=><option key={l} value={l}>{number(l)}</option>)}</select></label>:<LineInput key={key(p)} id={`lines-${p.gameId}-${p.id}`} name={p.name} line={line} side={side} onChange={value=>choose(p,{line:value,book:book==='all'?null:book})}/> }
              <datalist id={`lines-${p.gameId}-${p.id}`}>{lines.filter(validJornadaLine).map(l=><option key={l} value={l}/>)}</datalist>
              <div className={styles.evidence}><span>Últimos {sample} · {JORNADA_MARKETS[market]}</span><strong>{!stat.valid?'Sin muestra para evaluar':line===null?'Elegí una línea':!stat.decided?'Solo empates en esta muestra':`${stat.hits} de ${stat.decided} ${side==='over'?'superaron':'quedaron por debajo de'} ${number(line)}`}</strong><small>{line!==null&&(published?"Línea publicada · ":choices[key(p)]?"Línea ajustada · ":"Línea inicial de L10 · ")}Promedio {number(stat.average)}{stat.pushes?` · ${stat.pushes} empate(s)`:''}{stat.valid<sample?` · ${stat.valid} con dato`:''}</small></div>
              <div className={styles.prices}><span>Cuota individual · {side==='over'?'Over':'Under'}</span><QuotePriceCards
                label={`Cuotas de ${p.name}`} selectedBook={selectedBook} bestPrice={best}
                cards={Object.entries(BOOK_LABELS).filter(([b])=>book==='all'||b===book).map(([b,label])=>({key:b,label:({bet365:'365',betano:'Bto',stake:'Ste'} as Record<string,string>)[b]??label,price:quoteAt(p,b,line,side)?.price??null}))}
                onSelectBook={b=>choose(p,{book:b})}/><small>{selectedQuote?'Cuota seleccionada':best!==null?'Verde: mejor precio disponible':line===null?'Elegí una línea':'Sin cuota para esta línea'}</small></div>


              <div className={styles.actions}><Link href={href}>Ver ficha <ArrowUpRight size={13}/></Link><button disabled={busy||!validJornadaLine(line)} onClick={()=>add(p)}><Plus size={13}/> Al analizador</button></div>
              {line!==null&&dots.length>0&&<div className={styles.sequence} aria-label="Últimos resultados, más reciente a la derecha"><span>L10 · anterior → reciente</span>{dots.map((_,index)=>{const i=dots.length-1-index,outcome=dots[i];return <span key={i} data-outcome={outcome} data-l5={i<5} title={(p.dates[i]??'')+' · '+(p.values[i]??'S/D')} aria-label={outcome==='hit'?'Acierto':outcome==='miss'?'Fallo':outcome==='push'?'Empate':'Sin dato'}>{outcome==='hit'?'✓':outcome==='miss'?'×':outcome==='push'?'=':'·'}</span>;})}<small>Últimos 5 resaltados</small>{streak>1&&<small>{streak} aciertos seguidos</small>}</div>}
              <div className={styles.rowDetails}>
              <AlternativeLines quotes={p.quotes} values={p.values.slice(0,10)} historyLabel="L10" line={line} book={selectedBook} bookFilter={book} side={side} onSelect={(value,house)=>choose(p,{line:value,book:house})}/>
              <details className={styles.playerAnalysis}>
                <summary>Ver análisis<span className={styles.analysisPlayer}> · {p.name}</span></summary>
                <div className={styles.analysisBody}>
                  <h3>{JORNADA_MARKETS[market]} · {line===null?'Sin línea':(side==='over'?'Más de ':'Menos de ')+number(line)}</h3>
                  <p><strong>Últimos 5:</strong> {explainSample(l5,line,side)}</p>
                  <p><strong>Últimos 10:</strong> {explainSample(l10,line,side)}</p>
                  {p.support?<NbaMarketSupport support={sample===5?p.support.l5:p.support.l10} label={`L${sample}`}/>:<p><strong>Minutos:</strong> {minutes.average===null?'Sin datos':number(minutes.average)+' de promedio en '+minutes.valid+' partidos del L'+sample}.</p>}
                  <p><strong>Contra {p.opponent}:</strong> {rivalSource==='unavailable'?'Historial adicional no disponible.':rival.total?(rivalSource==='recent'?'Cruces dentro de L10. ':'Hasta cinco cruces anteriores. ')+explainSample(rival,line,side):'Sin cruces en el historial disponible.'}</p>
                  {p.extended?<><p><strong>Temporada {p.extended.season}:</strong> {explainSample(selectionSummary(p.extended.seasonValues,line??NaN,side),line,side)}</p>
                  <p><strong>Cara a cara vs. {p.opponent} · dos temporadas:</strong> {explainSample(selectionSummary(p.extended.h2hValues,line??NaN,side),line,side)}</p></>:<p>Temporada y cara a cara ampliado: disponibles cuando se publique el nuevo índice NBA.</p>}
                  {defenseRow?.rank&&<p><strong>Defensa de {p.opponent}:</strong> {defenseRow.rank}º de {defenseRow.rankedTeams} {defenseReferencePosition(p.position)?"por posición":"en la referencia de todo el equipo"}, con {defenseRow.games} partidos en la referencia {referenceSeason}. El 1º es el que más permite.</p>}
                  {p.values.length>0&&<ol className={styles.analysisGames} aria-label="Hasta cinco partidos recientes, del más reciente al más antiguo">{p.values.slice(0,5).map((value,i)=>{
                    const outcome=dots[i];
                    return <li key={i}><span>{p.dates[i]?shortDate(p.dates[i]):'Sin fecha'} · {p.opponents?.[i]??'Rival S/D'}</span><strong>{number(value,value!==null&&Number.isInteger(value)?0:1)}</strong><span data-outcome={outcome}>{value===null?'Sin dato':line===null?'Sin línea':outcome==='hit'?'Acierto':outcome==='miss'?'No acertó':'Empate'}</span></li>;
                  })}</ol>}
                  <small>Referencia histórica; no es una predicción del próximo partido.</small>
                </div>
              </details>
              <JornadaAbsenceImpact data={injuryImpact.results[impactPlayerKey({playerId:p.id,gameId:p.gameId})]??null} market={market}/>
              </div>
            </article>;
          })}
        </div>}
        {visible.length>visibleLimit&&<button type="button" className={styles.morePlayers} onClick={()=>setVisibleLimit(n=>n+40)}>Mostrar 40 más · {Math.min(visibleLimit,visible.length)} de {visible.length}</button>}
      </>}
      <details className={styles.method}><summary>Muestra y lectura de los datos</summary><p>L5 y L10 usan los registros recientes del archivo verificado anteriores a la fecha elegida. Solo temporada regular y playoffs; se limitan a esta temporada y la anterior y pueden incluir equipos históricos. El equipo y rival de la jornada se toman del plantel de referencia y del calendario. Contra el rival muestra los cruces dentro de L10 si existen. Si no, busca hasta los últimos cinco contra ese equipo en la temporada actual y la anterior, antes de la fecha elegida. En la ficha podés profundizar con todos los filtros.</p><p>Se indica la cantidad válida sobre 5 o 10, aunque el resumen tenga menos registros. Los datos ausentes quedan S/D y un cero confirmado se conserva. Los porcentajes cuentan aciertos sobre resultados decididos: un resultado igual a la línea es empate y se muestra aparte. Describen esta muestra; no son una probabilidad calculada del próximo encuentro.</p><p>Las cuotas son las últimas capturas publicadas para la misma fecha, rival, mercado, período, lado y línea. Pueden haber cambiado en la casa. Al cambiar línea se retira la casa seleccionada; elegila otra vez para llevar el precio. La línea inicial es la media línea más cercana al promedio de los últimos 10 partidos disponibles del jugador; si queda justo entre dos, se toma la superior. Sin muestra queda vacía. Las flechas ajustan de a 1 desde 0,5. La línea no cambia si falta la cuota. No implica recomendación. Agregar al analizador guarda un borrador que tenés que revisar y analizar.</p>{data.archiveId&&<p>Versión histórica: <code>{data.archiveId}</code></p>}</details>
    </>:null}
  </section>;
}
