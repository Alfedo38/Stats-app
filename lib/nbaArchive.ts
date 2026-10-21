import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

type Part={path:string;sha256:string;rows:number;bytes:number};
type Manifest={format:number;id:string;counts:Record<string,number>;parts:Record<string,Part>};
export const archiveEnabled=()=>process.env.NBA_ARCHIVE_READ==='1';
let current:{until:number;value:Manifest}|undefined;
const cache=new Map<string,Promise<any>>();
async function download(path:string):Promise<Buffer>{
  if(!/^(manifest\.json|objects\/[a-zA-Z0-9_./-]+\.json\.gz)$/.test(path)||path.includes('..'))throw Error('ARCHIVE_PATH');
  const base=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket=process.env.NBA_ARCHIVE_BUCKET||'nba-history';
  if(!base?.startsWith('https://')||!token||!/^[a-zA-Z0-9-]+$/.test(bucket))throw Error('ARCHIVE_CONFIG');
  const r=await fetch(`${base.replace(/\/$/,'')}/storage/v1/object/authenticated/${bucket}/${path}${path==='manifest.json'?'?cacheNonce='+randomUUID():''}`,{headers:{apikey:token,Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error('ARCHIVE_HTTP_'+r.status);
  const b=Buffer.from(await r.arrayBuffer());if(b.length>49_000_000)throw Error('ARCHIVE_SIZE');return b;
}
export async function archiveManifest(fresh=false):Promise<Manifest>{
  if(!fresh&&current&&current.until>Date.now())return current.value;
  const m=JSON.parse((await download('manifest.json')).toString());
  if(m.format!==1||!/^[a-f0-9]{64}$/.test(m.id)||!m.parts||!m.counts)throw Error('ARCHIVE_MANIFEST');
  current={until:Date.now()+60000,value:m};return m;
}
export async function archivePart(name:string,manifest?:Manifest):Promise<any>{
  const m=manifest??await archiveManifest(),part=m.parts[name];
  if(!part)return name==='summaries'?{}:[];
  if(!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('ARCHIVE_HASH_FORMAT');
  if(!/^objects\/[a-zA-Z0-9_./-]+\.json\.gz$/.test(part.path)||part.path.includes('..'))throw Error('ARCHIVE_PATH');
  const prior=cache.get(part.sha256);if(prior)return prior;
  const value=(async()=>{
    const b=await download(part.path);
    if(b.length!==part.bytes||createHash('sha256').update(b).digest('hex')!==part.sha256)throw Error('ARCHIVE_HASH');
    const decoded=JSON.parse(gunzipSync(b,{maxOutputLength:100_000_000}).toString());
    if((Array.isArray(decoded)?decoded.length:Object.keys(decoded).length)!==part.rows)throw Error('ARCHIVE_COUNT');
    return decoded;
  })();
  if(cache.size>=24)cache.delete(cache.keys().next().value!);
  cache.set(part.sha256,value);value.catch(()=>cache.delete(part.sha256));return value;
}
export async function archivedFacts(playerId:number){
  if(!Number.isSafeInteger(playerId)||playerId<=0)throw Error('ARCHIVE_PLAYER');
  const r:any[]=await archivePart(`facts/${playerId}`);
  return r.slice().sort((a,b)=>String(b.game_date).localeCompare(String(a.game_date)));
}
export async function archivedPlayer(playerId:number|null,playerName:string){
  if(playerId)return archivedFacts(playerId);
  const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,' ').trim().toLowerCase();
  const summary=await archivePart('summaries'),wanted=norm(playerName);
  const candidates=Object.entries(summary.players??{}).filter(([,name])=>norm(String(name))===wanted);
  if(candidates.length!==1)return []; // Un nombre ambiguo nunca mezcla jugadores.
  return archivedFacts(Number(candidates[0][0]));
}
export async function archivedRest(playerId:number,season:string){
  const [facts,s]=await Promise.all([archivedFacts(playerId),archivePart('summaries')]);
  const teams=new Set(facts.filter(r=>String(r.game_date)>=`${season.slice(0,4)}-10-01`&&String(r.game_date)<`${Number(season.slice(0,4))+1}-10-01`).map(r=>r.team_abbreviation));
  return [...teams].flatMap(t=>(s.teamDates?.[`${season}/${t}`]??[]).map((date:string)=>({team:t,date}))).sort((a,b)=>a.date.localeCompare(b.date));
}
export async function archivedContext(player:number,season:string){
  const m=await archiveManifest();const [shots,matchups,s]=await Promise.all([archivePart(`shots/${player}/${season}`,m),archivePart(`matchups/${player}/${season}`,m),archivePart('summaries',m)]);
  const defenders=new Set(matchups.map((r:any)=>String(r.defensive_player_id)));
  return {shots:[...shots].sort((a,b)=>String(b.game_date).localeCompare(String(a.game_date))||Number(a.game_event_id)-Number(b.game_event_id)),
    matchups:matchups.map((r:any)=>({...r,defensive_position:s.positions?.[String(r.defensive_player_id)]??''})).sort((a:any,b:any)=>String(b.game_date).localeCompare(String(a.game_date))||Number(b.partial_possessions)-Number(a.partial_possessions)),
    defenderFouls:(s.fouls??[]).filter((r:any)=>r.season===season&&defenders.has(String(r.player_id)))};
}
