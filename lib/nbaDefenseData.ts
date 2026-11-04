import 'server-only';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {playerComparableProfile} from './nbaComparableProfile';
import {defenseRankings,recentDefenders,type DefenseSettings,type DefenseReport} from './nbaDefense';

const cache=new Map<string,{until:number;value:Promise<DefenseReport>}>();
export function getDefenseReport(settings:DefenseSettings,details=false,profilePlayer:number|null=null):Promise<DefenseReport>{
 const key=JSON.stringify([settings,details,profilePlayer]),old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 const value=load(settings,details,profilePlayer),entry={until:Date.now()+60000,value};cache.set(key,entry);
 if(cache.size>48)cache.delete(cache.keys().next().value!);value.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});return value;
}
async function load(settings:DefenseSettings,details:boolean,profilePlayer:number|null):Promise<DefenseReport>{
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
 let profiles:DefenseReport['profiles'];
 if(details&&profilePlayer&&settings.opponent&&settings.market==='pts'){
  try{
   const factsKey=`facts/${profilePlayer}`,shotKey=`shots/${profilePlayer}/${settings.season}`;
   const [facts,shots]=await Promise.all([manifest.parts[factsKey]?archivePart(factsKey,manifest):[],manifest.parts[shotKey]?archivePart(shotKey,manifest):[]]);
   if(Array.isArray(facts)&&Array.isArray(shots)&&facts.length<=2000&&shots.length<=15000){
    const phases=settings.phase==='ALL'?['Regular Season','Playoffs']:[settings.phase];
    profiles=Object.fromEntries(phases.map(phase=>[phase,playerComparableProfile(facts,shots,settings.season,phase,settings.asOfDate)]));
   }
  }catch{/* Sigue disponible la comparación básica sin esos datos. */}
 }
 return {...empty,profiles,available:true,seasons,archiveId:manifest.id,through:dates.at(-1)??null,rankings,recent,recentAvailable,source:snapshot.source,positionSource:snapshot.positionSource};
}
