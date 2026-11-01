"use client";
import { useEffect, useState } from 'react';
export type QueryState<T> = { key: string; status: 'loading'|'ready'|'error'; data: T|null; error: string|null };
export function currentQuery<T>(state: QueryState<T>|null, key: string|null) {
  const current = key !== null && state?.key === key ? state : null;
  return { data: current?.status === 'ready' ? current.data : null,
    loading: key !== null && (!current || current.status === 'loading'),
    error: current?.status === 'error' ? current.error : null };
}
// Key validation applies during render, before the new effect starts.
export function useAnalysisQuery<T=any>(url: string|null, body?: Record<string,unknown>,timeoutMs?:number) {
  const encoded = body === undefined ? null : JSON.stringify(body);
  const key = url === null ? null : JSON.stringify([url,encoded]);
  const [state,setState] = useState<QueryState<T>|null>(null);
  useEffect(() => {
    if (key === null || url === null) return;
    const controller = new AbortController();
    setState({key,status:'loading',data:null,error:null});
    const timer=timeoutMs&&timeoutMs>0?setTimeout(()=>{controller.abort();setState({key,status:'error',data:null,error:'Se agotó el tiempo de consulta. Reintentá.'});},timeoutMs):undefined;
    fetch(url,{method:encoded===null?'GET':'POST',headers:encoded===null?undefined:{'Content-Type':'application/json'},
      body:encoded,signal:controller.signal,cache:'no-store'})
      .then(async response => {
        const data = await response.json();
        if (!response.ok || data?.ok === false) throw new Error(data?.error || 'No se pudieron cargar los datos.');
        if (!controller.signal.aborted) setState({key,status:'ready',data,error:null});
      })
      .catch(error => { if (!controller.signal.aborted) setState({key,status:'error',data:null,error:error?.message || 'No se pudieron cargar los datos.'}); }).finally(()=>{if(timer)clearTimeout(timer);});
    return () => {controller.abort();if(timer)clearTimeout(timer);};
  },[key,url,encoded,timeoutMs]);
  return currentQuery(state,key);
}
