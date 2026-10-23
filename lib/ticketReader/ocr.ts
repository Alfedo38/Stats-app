import type {Book} from './model';
type OcrWorker={recognize:(image:HTMLCanvasElement)=>Promise<{data:{text:string;confidence:number}}> ; setParameters:(p:Record<string,string>)=>Promise<unknown>;terminate:()=>Promise<unknown>};
type Engine={createWorker:(language:string,mode:number,options:Record<string,unknown>)=>Promise<OcrWorker>};
declare global {interface Window{Tesseract?:Engine}}
let enginePromise:Promise<Engine>|undefined;
function engine(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!enginePromise)enginePromise=new Promise<Engine>((resolve,reject)=>{const script=document.createElement('script');script.src='/ticket-reader/ocr/tesseract.min.js';script.async=true;script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('No se cargó el lector de imágenes.'));script.onerror=()=>reject(Error('No se encontraron los archivos del lector. Revisá la instalación.'));document.head.append(script);}).catch(e=>{enginePromise=undefined;throw e;});
 return enginePromise;
}
async function imageCanvas(file:File):Promise<{canvas:HTMLCanvasElement;book:Book}>{
 if(file.size>15_000_000)throw Error('Cada imagen puede pesar hasta 15 MB.');
 const url=URL.createObjectURL(file);const img=new Image();
 try{await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('No se pudo abrir la imagen. Probá PNG, JPG o WEBP.'));img.src=url;});
  if(img.width*img.height>24_000_000)throw Error('La imagen es demasiado grande. Recortá el ticket en partes.');
  const scale=Math.min(4,Math.max(1,1250/img.width),Math.sqrt(9_000_000/(img.width*img.height)));
  const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('El navegador no pudo preparar la imagen.');
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height);let dark=0,red=0,green=0,count=0;
  for(let i=0;i<data.data.length;i+=64){const r=data.data[i],g=data.data[i+1],b=data.data[i+2];if((r+g+b)/3<105)dark++;if(r>180&&r>g*1.5&&r>b*1.3)red++;if(g>65&&g>r*1.45&&g>b*1.15)green++;count++;}
  const book:Book=red/count>0.035?'betano':green/count>0.025?'bet365':dark/count>0.45?'stake':'unknown';const invert=dark/count>0.45;
  for(let i=0;i<data.data.length;i+=4){let gray=0.299*data.data[i]+0.587*data.data[i+1]+0.114*data.data[i+2];if(invert)gray=255-gray;gray=Math.min(255,Math.max(0,gray*1.55-70));data.data[i]=data.data[i+1]=data.data[i+2]=gray;}
  ctx.putImageData(data,0,0);return {canvas,book};
 }finally{URL.revokeObjectURL(url);}
}
async function recognizeFiles(files:File[],onProgress:(text:string)=>void,signal:AbortSignal){
 if(files.length>8)throw Error('Podés leer hasta 8 imágenes por tanda.');
 let worker:OcrWorker|undefined;const canceled=()=>{void worker?.terminate().catch(()=>{});};signal.addEventListener('abort',canceled);

 try{onProgress('Preparando el lector de imágenes…');const t=await engine();if(signal.aborted)throw Error('Lectura cancelada.');worker=await t.createWorker('eng',1,{workerPath:new URL('/ticket-reader/ocr/worker.min.js',location.origin).href,corePath:new URL('/ticket-reader/ocr',location.origin).href,langPath:new URL('/ticket-reader/ocr',location.origin).href,gzip:false,workerBlobURL:false,cacheMethod:'none',logger:(m:{status?:string;progress?:number})=>{if(m.status==='recognizing text')onProgress(`Leyendo texto… ${Math.round((m.progress??0)*100)} %`);}});
  if(signal.aborted)throw Error('Lectura cancelada.');await worker.setParameters({preserve_interword_spaces:'1'});const results:{text:string;book:Book;confidence:number}[]=[];
  for(let i=0;i<files.length;i++){if(signal.aborted)throw Error('Lectura cancelada.');onProgress(`Preparando imagen ${i+1} de ${files.length}…`);const {canvas,book}=await imageCanvas(files[i]);const out=await worker.recognize(canvas);results.push({text:out.data.text,book,confidence:out.data.confidence});}
  return results;
 }catch(e){if(signal.aborted)throw Error('Lectura cancelada.');throw e;
 }finally{signal.removeEventListener('abort',canceled);await worker?.terminate().catch(()=>{});}
}

export async function readImages(files:File[],onProgress:(text:string)=>void,signal:AbortSignal){
 const local=new AbortController();let timeout:ReturnType<typeof setTimeout>|undefined;let onCancel:(()=>void)|undefined;
 const interruption=new Promise<never>((_,reject)=>{onCancel=()=>{local.abort();reject(Error('Lectura cancelada.'));};signal.addEventListener('abort',onCancel,{once:true});if(signal.aborted)onCancel();timeout=setTimeout(()=>{local.abort();reject(Error('La lectura tardó demasiado. Probá con una imagen más nítida o pegá el texto.'));},180000);});
 try{return await Promise.race([recognizeFiles(files,onProgress,local.signal),interruption]);}
 finally{if(timeout)clearTimeout(timeout);if(onCancel)signal.removeEventListener('abort',onCancel);}
}
