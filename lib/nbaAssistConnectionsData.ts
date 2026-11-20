import 'server-only';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';

import {boundedParts} from './nbaReadParts';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {ASSIST_LEAGUE_PART,ASSIST_PART,assistDefense,assistLeagueAverage,assistShard,verifiedAssistSnapshot,verifiedAssistShard,
 type AssistSnapshot,type NamedAssistGame} from './nbaAssistConnections';

const localRoot=join(process.cwd(),'maintenance-state');
const legacyPath=join(localRoot,'assist-pilot','snapshot.json');
type Rival={team:string;cutoff:string;season:string};
type Source='local'|'archive'|'none';
const localCache=new Map<string,{mtime:number;size:number;data:unknown}>();
async function readLocal(path:string):Promise<unknown|null>{
 try{
  const info=await stat(path);
  if(!info.isFile()||info.size>500_000)throw Error('ASSIST_LOCAL_SIZE');
  const prior=localCache.get(path);
  if(prior?.mtime===info.mtimeMs&&prior?.size===info.size)return prior.data;
  const data:unknown=JSON.parse(await readFile(path,'utf8'));
  if(localCache.size>=48)localCache.delete(localCache.keys().next().value!);
  localCache.set(path,{mtime:info.mtimeMs,size:info.size,data});
  return data;
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return null;}
}

export async function readAssistConnections(ids:string[],rival?:Rival){
 const local=process.env.NODE_ENV==='development'&&process.env.NBA_ASSIST_LOCAL==='1';
 const keys=[...new Set(ids.map(assistShard))],wanted=new Set(ids);
 const games=new Map<string,NamedAssistGame>();
 const names:Record<string,string>={};
 let source:Source='none';
 const rivalFile=rival?`rivals/${rival.season}/${rival.team}`:null;
 const leagueFile=rival?`rivals/${rival.season}/NBA`:null;
 let rivalData:unknown=null,leagueData:unknown=null;
 async function loadParts(load:(key:string)=>Promise<unknown|null>,origin:Source){
  const needed=new Set(ids.filter(id=>!games.has(id)).map(assistShard));
  const remaining=keys.filter(key=>needed.has(key));
  // Limita las descargas simultáneas sin pedir el archivo completo de la liga.
  await boundedParts(remaining,async key=>{
    const data=await load(`games/${key}`);
    if(data===null)return;
    source=source==='local'?'local':origin;
    for(const game of verifiedAssistShard(data,key)){
     if(wanted.has(game.id)&&!games.has(game.id)){games.set(game.id,game);Object.assign(names,game.names);}
    }
  });
  if(rivalFile&&leagueFile&&rivalData===null)[rivalData,leagueData]=await Promise.all([load(rivalFile),load(leagueFile)]);
 }
 function addLegacy(raw:unknown,origin:Source){
  if(raw===null)return;
  const old=verifiedAssistSnapshot(raw);
  for(const game of old.games){
   if(wanted.has(game.id)&&!games.has(game.id)){
    games.set(game.id,{...game,names:old.names});source=source==='local'?'local':origin;
    for(const roster of game.rosters)for(const pid of roster[1])names[String(pid)]??=old.names[String(pid)];
   }
  }
 }
 if(local){
  await loadParts(key=>readLocal(join(localRoot,'assist-league','parts',key+'.json')),'local');
  if(games.size!==ids.length)addLegacy(await readLocal(legacyPath),'local');
 }
 // En vista previa usamos los datos del piloto si existen; no exige publicar en Supabase.
 if(archiveEnabled()&&(games.size<ids.length||rivalFile&&rivalData===null)&&(!local||source==='none')){
  const manifest=await archiveManifest();
  await loadParts(key=>{
   const part=`${ASSIST_LEAGUE_PART}/${key}`;
   return manifest.parts[part]?archivePart(part,manifest):Promise.resolve(null);
  },'archive');
  if(games.size!==ids.length&&manifest.parts[ASSIST_PART])addLegacy(await archivePart(ASSIST_PART,manifest),'archive');
 }
 const snapshot:Pick<AssistSnapshot,'games'|'names'>={games:[...games.values()],names};
 return {source,snapshot,defense:rival&&rivalData!==null?{team:rival.team,...assistDefense(rivalData,rival.cutoff,rival.season),league:leagueData===null?null:assistLeagueAverage(leagueData,rival.cutoff)}:null};
}
