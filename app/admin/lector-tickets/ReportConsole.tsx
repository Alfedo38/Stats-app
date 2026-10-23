'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createReporter} from '@/lib/ticketReader/reportClient';
import {createAnalysisCollector} from '@/lib/ticketReader/analysisClient';
import type {ReaderReport} from '@/lib/ticketReader/diagnosticModel';
import s from './reports.module.css';
type Export={exportedAt:string;counts:{total:number;ok:number;review:number;error:number};reports:(ReaderReport&{receivedAt:string;tester:string})[]};
type AnalysisIndex={counts:{total:number;complete:number;partial:number;review:number;error:number};analyses:{id:string;receivedAt:string;tester:string;eventDate:string;status:string;counts:{total:number;analyzed:number;ready:number;review:number;error:number}}[]};
export default function ReportConsole({storageKey}:{storageKey:string}){
 const [data,setData]=useState<Export|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(0);
 const [analyses,setAnalyses]=useState<AnalysisIndex|null>(null),[analysisError,setAnalysisError]=useState(''),[pendingAnalyses,setPendingAnalyses]=useState(0);
 async function refresh(){
  setBusy(true);setError('');setAnalysisError('');
  const get=async(path:string)=>{const response=await fetch(path,{credentials:'same-origin',cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error||'No se pudieron consultar los informes.');return body;};
  const [diagnostics,snapshots]=await Promise.allSettled([get('/api/admin/ticket-reader-reports'),get('/api/admin/ticket-reader-analyses')]);
  if(diagnostics.status==='fulfilled')setData(diagnostics.value);else{setData(null);setError(diagnostics.reason?.message||'No se pudieron consultar los diagnósticos.');}
  if(snapshots.status==='fulfilled')setAnalyses(snapshots.value);else{setAnalyses(null);setAnalysisError(snapshots.reason?.message||'No se pudieron consultar los análisis.');}
  setPending(createReporter(storageKey).queued().length);setPendingAnalyses(createAnalysisCollector(storageKey).queued().length);setBusy(false);
 }
 useEffect(()=>{void Promise.allSettled([createReporter(storageKey).flush(),createAnalysisCollector(storageKey).flush()]).finally(()=>void refresh());},[storageKey]);
 function local(){const reports=createReporter(storageKey).queued();const blob=new Blob([JSON.stringify({version:5,exportedAt:new Date().toISOString(),source:'pending-browser',reports},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lector-tickets-pendientes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function localAnalyses(){const snapshots=createAnalysisCollector(storageKey).queued();const blob=new Blob([JSON.stringify({schema:'nba-ticket-analysis-export',version:1,exportedAt:new Date().toISOString(),source:'pending-browser',analyses:snapshots},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='analisis-tickets-pendientes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const time=(value:string)=>new Date(value).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});
 return <main className={s.page}>
  <Link href="/analizar-ticket">← Volver al lector</Link><h1>Informes del lector</h1>
  <div className={s.actions}><button disabled={busy} onClick={()=>void refresh()}>{busy?'Actualizando…':'Actualizar'}</button></div>
  <h2>Análisis de tickets</h2><p>Un JSON por cada intento de análisis, con sus selecciones y antecedentes. Se conservan los más recientes: hasta 100 análisis de los últimos 14 días, con un máximo total de 2 MiB de contenido.</p>
  <div className={s.actions}>{analyses&&<a href="/api/admin/ticket-reader-analyses?download=1">Descargar análisis completos</a>}{pendingAnalyses>0&&<button onClick={localAnalyses}>Descargar análisis pendientes de este navegador ({pendingAnalyses})</button>}</div>
  {analysisError&&<p role="alert" className={s.error}>{analysisError}</p>}
  {analyses&&<><p className={s.connected}>Registro de análisis activo</p><div className={s.metrics}><div><span>Intentos guardados</span><strong>{analyses.counts.total}</strong></div><div><span>Completos</span><strong>{analyses.counts.complete}</strong></div><div><span>Parciales o para revisar</span><strong>{analyses.counts.partial+analyses.counts.review}</strong></div><div><span>Errores</span><strong>{analyses.counts.error}</strong></div></div>
   <div className={s.table}><table><thead><tr><th>Fecha de prueba</th><th>Fecha del ticket</th><th>Estado</th><th>Consultadas / selecciones</th><th>Errores</th><th>Usuario de prueba</th></tr></thead><tbody>{analyses.analyses.map(r=><tr key={r.id}><td>{time(r.receivedAt)}</td><td>{r.eventDate}</td><td>{{complete:'Completo',partial:'Parcial',review:'Para revisar',error:'Error'}[r.status]||r.status}</td><td>{r.counts.analyzed} / {r.counts.total}</td><td>{r.counts.error}</td><td>{r.tester}</td></tr>)}</tbody></table></div>
   {!analyses.analyses.length&&<p>Todavía no hay análisis guardados. Pulsá Analizar en un ticket para generar el primero.</p>}</>}
  <h2>Diagnósticos de funcionamiento</h2><p>Comprobaciones y errores del lector. Hasta 1.000 registros de los últimos 14 días.</p>
  <div className={s.actions}>{data&&<a href="/api/admin/ticket-reader-reports?download=1">Descargar diagnósticos</a>}{pending>0&&<button onClick={local}>Descargar diagnósticos pendientes de este navegador ({pending})</button>}</div>
  {error&&<p role="alert" className={s.error}>{error}</p>}{data&&<><p className={s.connected}>Registro central activo</p><div className={s.metrics}>{Object.entries(data.counts).map(([key,value])=><div key={key}><span>{{total:'Total',ok:'Correctos',review:'Para revisar',error:'Errores'}[key]}</span><strong>{value}</strong></div>)}</div><h2>Últimos diagnósticos</h2><div className={s.table}><table><thead><tr><th>Fecha</th><th>Prueba</th><th>Resultado</th><th>Código</th><th>Usuario de prueba</th></tr></thead><tbody>{data.reports.map(r=><tr key={r.id}><td>{time(r.receivedAt)}</td><td>{r.stage}</td><td>{r.outcome}</td><td>{r.code}</td><td>{r.tester}</td></tr>)}</tbody></table></div>{!data.reports.length&&<p>Todavía no hay pruebas registradas. Cargá y analizá un ticket para comprobar el registro.</p>}</>}
 </main>;
}
