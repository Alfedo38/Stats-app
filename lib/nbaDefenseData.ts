import 'server-only';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {defenseRankings,recentDefenders,type DefenseSettings,type DefenseReport} from './nbaDefense';

const cache=new Map<string,{until:number;value:Promise<DefenseReport>}>();
export function getDefenseReport(settings:DefenseSettings,details=false):Promise<DefenseReport>{
 const key=JSON.stringify([settings,details]),old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 const value=load(settings,details),entry={until:Date.now()+60000,value};cache.set(key,entry);
 if(cache.size>48)cache.delete(cache.keys().next().value!);value.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});return value;
}
async function load(settings:DefenseSettings,details:boolean):Promise<DefenseReport>{
 const empty:DefenseReport={ok:true,available:false,archiveId:null,settings,seasons:[],through:null,source:'Archivo NBA verificado',positionSource:'Posición de referencia del catálogo',minGames:5,rankings:{ALL:[],G:[],F:[],C:[]},recent:[],recentAvailable:false};
 if(!archiveEnabled())return {...empty,reason:'Lectura del archivo desactivada. Revisá la configuración del servidor.'};
 // Todos los objetos de esta respuesta pertenecen al mismo índice.
 const manifest=await archiveManifest(),seasons=Object.keys(manifest.parts).filter(k=>/^defense\/20\d{2}-\d{2}$/.test(k)).map(k=>k.split('/')[1]).sort().reverse();
 const name='defense/'+settings.season;
 if(!manifest.parts[name])return {...empty,seasons,archiveId:manifest.id,reason:seasons.length?'Todavía no hay resumen defensivo para esta temporada.':'Falta publicar el resumen de defensas con el mantenimiento actualizado.'};
 const snapshot=await archivePart(name,manifest);
 if(snapshot?.format!==1||snapshot?.scope!=='FULL'||snapshot.season!==settings.season||!Array.isArray(snapshot.games)||snapshot.games.length>15000)throw Error('DEFENSE_FORMAT');
 const rankings=defenseRankings(snapshot.games,settings),dates=rankings.ALL.map(r=>r.last).filter((d):d is string=>d!==null).sort();
 let recent:DefenseReport['recent']=[],recentAvailable=false;
 if(details&&settings.opponent){
  const recentName=`defense-players/${settings.season}/${settings.opponent}`;
  if(manifest.parts[recentName]){
   try{const rows=await archivePart(recentName,manifest);if(!Array.isArray(rows)||rows.length>30000)throw Error('DEFENSE_RECENT_LIMIT');recent=recentDefenders(rows,settings);recentAvailable=true;}catch{/* El ranking válido se conserva; la tabla indica que no pudo cargarse. */}
  }
 }
 return {...empty,available:true,seasons,archiveId:manifest.id,through:dates.at(-1)??null,rankings,recent,recentAvailable,source:snapshot.source,positionSource:snapshot.positionSource};
}
