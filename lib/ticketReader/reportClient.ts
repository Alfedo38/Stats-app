import {sanitizeReport,type ReaderReport,type ReportOutcome,type ReportStage} from './diagnosticModel';

export function createReporter(storageKey:string){
 const key=storageKey+':diagnostics-v5';let memory:ReaderReport[]=[],volatile=false,running:Promise<void>|undefined;
 const read=()=>{if(volatile)return memory.map(v=>sanitizeReport(v)).filter((x):x is ReaderReport=>!!x);try{const list=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(list)?list.map(v=>sanitizeReport(v)).filter((x):x is ReaderReport=>!!x).slice(-30):memory;}catch{volatile=true;return memory;}};
 const write=(list:ReaderReport[])=>{memory=list.slice(-30);try{localStorage.setItem(key,JSON.stringify(memory));}catch{volatile=true;}};
 const flush=()=>{
  if(running)return running;
  running=(async()=>{for(const event of read()){
   try{const response=await fetch('/api/ticket-reader/reports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),signal:AbortSignal.timeout(5000)});const data=await response.json();if(!response.ok||data.saved!==true)break;write(read().filter(x=>x.id!==event.id));}catch{break;}
  }})().finally(()=>{running=undefined;});return running;
 };
 const remember=(event:ReaderReport)=>{const safe=sanitizeReport(event);if(!safe)return;write([...read().filter(x=>x.id!==safe.id),safe]);void flush();};
 return {flush,remember,queued:read,record:(traceId:string,stage:ReportStage,outcome:ReportOutcome,code:string,data:Record<string,unknown>)=>remember({id:crypto.randomUUID(),traceId,version:5,at:new Date().toISOString(),stage,outcome,code,data})};
}
