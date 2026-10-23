import {sanitizeAnalysis, type AnalysisSnapshot} from './analysisSnapshot';

export function createAnalysisCollector(storageKey:string){
 const key=storageKey+':analysis-snapshots-v1';
 let memory:AnalysisSnapshot[]=[],volatile=false,running:Promise<void>|undefined;
 const read=()=>{
  if(volatile)return memory.map(value=>sanitizeAnalysis(value)).filter((x):x is AnalysisSnapshot=>!!x);
  try{const list=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(list)?list.map(value=>sanitizeAnalysis(value)).filter((x):x is AnalysisSnapshot=>!!x).slice(-3):memory;}
  catch{volatile=true;return memory;}
 };
 const write=(list:AnalysisSnapshot[])=>{memory=list.slice(-3);try{localStorage.setItem(key,JSON.stringify(memory));}catch{volatile=true;}};
 const flush=()=>{
  if(running)return running;
  running=(async()=>{for(let attempted=0;attempted<6;attempted++){
   const snapshot=read()[0];if(!snapshot)break;
   try{
    const response=await fetch('/api/ticket-reader/analyses',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot}),signal:AbortSignal.timeout(8000)});
    const data=await response.json();if(!response.ok||data.saved!==true)break;
    write(read().filter(x=>x.id!==snapshot.id));
   }catch{break;}
  }})().finally(()=>{running=undefined;});return running;
 };
 return {flush,queued:read,remember:(value:AnalysisSnapshot)=>{const snapshot=sanitizeAnalysis(value);if(!snapshot)return;write([...read().filter(x=>x.id!==snapshot.id),snapshot]);void flush();}};
}
