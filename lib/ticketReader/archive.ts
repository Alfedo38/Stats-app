import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {ReaderError} from './errors';

type Part={path:string;sha256:string;bytes:number;rows:number};
export type ReaderManifest={format:1;id:string;parts:Record<string,Part>;counts:Record<string,number>};
let manifestCache:{until:number;value:Promise<ReaderManifest>}|undefined;
const parts=new Map<string,Promise<unknown>>();
export function archiveConfig(){
 const url=(process.env.NBA_TICKET_ARCHIVE_URL||process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
 const token=process.env.NBA_TICKET_ARCHIVE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
 const bucket=process.env.NBA_TICKET_ARCHIVE_BUCKET||process.env.NBA_ARCHIVE_BUCKET||'nba-history';
 let valid=false;try{const parsed=new URL(url);valid=parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&parsed.pathname==='/'&&!parsed.search&&!parsed.hash;}catch{}
 if(!valid||!token||!/^[a-zA-Z0-9-]+$/.test(bucket))throw new ReaderError('ARCHIVE_CONFIG','Falta configurar el archivo NBA en este servidor. Ejecutá el instalador v2 y reiniciá npm run dev.');
 return {url,token,bucket};
}
async function download(path:string,maxBytes:number){
 const {url,token,bucket}=archiveConfig();
 if(!/^(manifest\.json|objects\/[a-zA-Z0-9_./-]+\.json\.gz)$/.test(path)||path.includes('..'))throw new ReaderError('ARCHIVE_INVALID','El índice histórico contiene una ruta inválida.');
 const nonce=path==='manifest.json'?'?cacheNonce='+randomUUID():'';
 let response:Response;
 try{response=await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path}${nonce}`,{headers:{apikey:token,Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(45000)});}catch{throw new ReaderError('ARCHIVE_CONNECTION','No se pudo conectar con el archivo NBA. Revisá la conexión y volvé a comprobarla.');}
 if(!response.ok)throw new ReaderError('ARCHIVE_ACCESS','El archivo NBA no respondió correctamente. Revisá las credenciales de servidor y el bucket configurado.');
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>maxBytes)throw new ReaderError('ARCHIVE_INVALID','El archivo histórico supera el tamaño esperado.');
 const reader=response.body?.getReader();if(!reader)throw new ReaderError('ARCHIVE_INVALID','La respuesta del archivo NBA está vacía.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new ReaderError('ARCHIVE_INVALID','El archivo histórico supera el tamaño esperado.');}chunks.push(value);}}
 catch(error){if(error instanceof ReaderError)throw error;throw new ReaderError('ARCHIVE_CONNECTION','Se interrumpió la descarga del histórico. Reintentá la consulta.');}
 finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
export async function readerManifest(fresh=false):Promise<ReaderManifest>{
 archiveConfig();if(!fresh&&manifestCache&&manifestCache.until>Date.now())return manifestCache.value;
 const value=(async()=>{let m:ReaderManifest;try{m=JSON.parse((await download('manifest.json',8_000_000)).toString());}catch(error){if(error instanceof ReaderError)throw error;throw new ReaderError('ARCHIVE_INVALID','No se pudo interpretar el índice del archivo NBA.');}
  if(m.format!==1||!/^[a-f0-9]{64}$/.test(m.id)||!m.parts||typeof m.parts!=='object'||Array.isArray(m.parts)||!m.counts||typeof m.counts.facts!=='number'||m.counts.facts<=0||!Object.keys(m.parts).some(k=>/^facts\/\d+$/.test(k)))throw new ReaderError('ARCHIVE_EMPTY','El archivo NBA está vacío o su índice no es válido. No se calcularon estadísticas.');
  return m;
 })();const entry={until:Date.now()+30000,value};manifestCache=entry;value.catch(()=>{if(manifestCache===entry)manifestCache=undefined;});return value;
}
export async function readerPart<T=Record<string,unknown>[]>(name:string,manifest?:ReaderManifest):Promise<T>{
 const m=manifest??await readerManifest(),part=m.parts[name];
 if(!part)return (name==='summaries'?{}:[]) as T;
 if(!part||!/^[a-f0-9]{64}$/.test(part.sha256)||!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>49_000_000||!Number.isSafeInteger(part.rows)||part.rows<0)throw new ReaderError('ARCHIVE_INVALID','El índice del histórico contiene un archivo inválido.');
 const prior=parts.get(part.sha256);if(prior)return prior as Promise<T>;
 const result=(async()=>{const bytes=await download(part.path,part.bytes);
  if(bytes.length!==part.bytes||createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw new ReaderError('ARCHIVE_HASH','No coincide la verificación del histórico. Reintentá; no se utilizaron datos sin verificar.');
  let data;try{data=JSON.parse(gunzipSync(bytes,{maxOutputLength:100_000_000}).toString());}catch{throw new ReaderError('ARCHIVE_INVALID','No se pudo abrir el archivo histórico verificado.');}
  if(!data||typeof data!=='object'||(Array.isArray(data)?data.length:Object.keys(data).length)!==part.rows)throw new ReaderError('ARCHIVE_COUNT','El contenido histórico no coincide con su índice.');
  return data as T;
 })();if(parts.size>=24)parts.delete(parts.keys().next().value!);parts.set(part.sha256,result);result.catch(()=>parts.delete(part.sha256));return result;
}
